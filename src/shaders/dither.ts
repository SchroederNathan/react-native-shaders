import tgpu, { std } from 'typegpu';
import * as d from 'typegpu/data';

import type { ShaderModule } from '../core/types';

export const DITHER_TYPE_RANDOM = 1;
export const DITHER_TYPE_2X2 = 2;
export const DITHER_TYPE_4X4 = 3;
export const DITHER_TYPE_8X8 = 4;

/**
 * Uniform layout for the dither shader.
 *
 * `resolution` is written automatically by `<ShaderMount/>` every frame.
 * The component supplies `imageSize`, `pxSize`, `ditherType`, `colorBack`,
 * and `colorFront`.
 */
export const DitherUniforms = d.struct({
  resolution: d.vec2f,
  imageSize: d.vec2f,
  pxSize: d.f32,
  ditherType: d.u32,
  colorBack: d.vec4f,
  colorFront: d.vec4f,
  scale: d.f32,
  rotation: d.f32,
});

// Bayer threshold matrices, scaled to 0..1. Layout matches paper-design's
// reference (https://github.com/paper-design/shaders) so the visual output
// is identical when the same pxSize and dither type are picked.
const bayer2 = tgpu.fn([d.vec2u], d.f32)((p) => {
  'use gpu';
  const m = d.arrayOf(d.u32, 4)([0, 2, 3, 1]);
  return d.f32(m[(p.y & 1) * 2 + (p.x & 1)]) / d.f32(4);
});

const bayer4 = tgpu.fn([d.vec2u], d.f32)((p) => {
  'use gpu';
  const m = d.arrayOf(d.u32, 16)([
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5,
  ]);
  return d.f32(m[(p.y & 3) * 4 + (p.x & 3)]) / d.f32(16);
});

const bayer8 = tgpu.fn([d.vec2u], d.f32)((p) => {
  'use gpu';
  const m = d.arrayOf(d.u32, 64)([
    0, 32, 8, 40, 2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44, 4, 36, 14, 46, 6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37,
    63, 31, 55, 23, 61, 29, 53, 21,
  ]);
  return d.f32(m[(p.y & 7) * 8 + (p.x & 7)]) / d.f32(64);
});

// hash21 from paper-design — cheap procedural random for "random" dither.
const hash21 = tgpu.fn([d.vec2f], d.f32)((p) => {
  'use gpu';
  let q = std.fract(p.mul(d.vec2f(0.3183099, 0.3678794))).add(d.vec2f(0.1));
  q = q.add(d.vec2f(std.dot(q, q.add(d.vec2f(19.19)))));
  return std.fract(q.x * q.y);
});

// "Cover" UV mapping — image fills the canvas, cropping the longer axis.
const coverUv = tgpu.fn(
  [d.vec2f, d.vec2f, d.vec2f],
  d.vec2f,
)((uv, resolution, imageSize) => {
  'use gpu';
  const canvasAspect = resolution.x / resolution.y;
  const imageAspect = imageSize.x / imageSize.y;
  let uvScale = d.vec2f(1, 1);
  if (canvasAspect > imageAspect) {
    uvScale = d.vec2f(1, imageAspect / canvasAspect);
  } else {
    uvScale = d.vec2f(canvasAspect / imageAspect, 1);
  }
  return uv.sub(d.vec2f(0.5)).mul(uvScale).add(d.vec2f(0.5));
});

export const ditherShader: ShaderModule<typeof DitherUniforms> = {
  uniforms: DitherUniforms,
  fragment: (layout) =>
    tgpu.fragmentFn({
      in: { uv: d.vec2f, fragCoord: d.builtin.position },
      out: d.vec4f,
    })((input) => {
      'use gpu';
      const u = layout.$.uniforms;

      // Pixelize: each pxSize × pxSize block of canvas pixels samples the
      // source ONCE and is shaded as a single dither cell. This is what
      // gives the chunky retro look — no intensity ramp, just block-level
      // sampling.
      const pxSize = std.max(u.pxSize, d.f32(1));
      const blockCoord = std.floor(input.fragCoord.xy.div(pxSize));
      const blockCenter = blockCoord.add(d.vec2f(0.5)).mul(pxSize);
      const normalizedUv = blockCenter.div(u.resolution);

      // Apply scale + rotation around the image center, AFTER coverUv. The
      // dither cell grid (blockCoord) is computed from fragCoord above and
      // stays anchored to the canvas — only the sampling UV moves. This is
      // what gives stable, non-juddery cells when the image is animated.
      const covered = coverUv(normalizedUv, u.resolution, u.imageSize);
      const centered = covered.sub(d.vec2f(0.5));
      const c = std.cos(u.rotation);
      const s = std.sin(u.rotation);
      const rotated = d.vec2f(
        centered.x * c - centered.y * s,
        centered.x * s + centered.y * c,
      );
      const scaledSafe = std.max(u.scale, d.f32(0.0001));
      const sampleUv = rotated.div(scaledSafe).add(d.vec2f(0.5));

      const src = std.textureSample(
        layout.$.sourceTex,
        layout.$.sourceSampler,
        sampleUv,
      );

      // Native decoders (CGBitmapContext on iOS, BitmapFactory on Android)
      // hand us premultiplied RGBA, so a transparent input pixel reads as
      // RGB=0. Un-premultiply before computing luminance so transparent
      // areas don't get treated as solid black; opaque pixels (alpha=1) are
      // unaffected, so JPEGs continue to behave identically.
      const srcAlpha = src.a;
      const safeAlpha = std.max(srcAlpha, d.f32(0.0001));
      const straightRgb = src.rgb.div(safeAlpha);

      // Perceptual luminance (Rec. 601). Drives the dither: brighter pixels
      // are more likely to land above threshold and pick up the front
      // colour.
      const lum = std.dot(straightRgb, d.vec3f(0.299, 0.587, 0.114));

      const blockUi = d.vec2u(d.u32(blockCoord.x), d.u32(blockCoord.y));
      let dithering = d.f32(0);
      if (u.ditherType === DITHER_TYPE_RANDOM) {
        dithering = hash21(blockCenter);
      } else if (u.ditherType === DITHER_TYPE_2X2) {
        dithering = bayer2(blockUi);
      } else if (u.ditherType === DITHER_TYPE_4X4) {
        dithering = bayer4(blockUi);
      } else {
        dithering = bayer8(blockUi);
      }

      // Shift the threshold so 0.5 is the neutral midpoint, then binary
      // step. The result is exactly 0 or 1 — there is no intensity
      // blending; the local density of "front" pixels is what encodes the
      // original image brightness.
      const res = std.step(d.f32(0.5), lum + dithering - d.f32(0.5));

      // Front-over-back compositing with premultiplied alphas, matching
      // the paper-design reference. With an opaque canvas the alpha
      // collapses out, but this keeps the output well-defined for
      // translucent colours.
      const fg = u.colorFront.rgb.mul(u.colorFront.a);
      const bg = u.colorBack.rgb.mul(u.colorBack.a);
      let color = fg.mul(res);
      let opacity = u.colorFront.a * res;
      color = color.add(bg.mul(d.f32(1) - opacity));
      opacity = opacity + u.colorBack.a * (d.f32(1) - opacity);

      // Cut out: scale the dithered output by the source alpha so
      // transparent input pixels produce transparent output. Premultiplied
      // form is preserved for the canvas's `premultiplied` alpha mode.
      return d.vec4f(color.mul(srcAlpha), opacity * srcAlpha);
    }),
};
