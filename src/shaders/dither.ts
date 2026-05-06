import * as d from 'typegpu/data';

import { FULLSCREEN_TRIANGLE_VS } from '../core/wgsl-snippets';
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
});

const DITHER_FS = /* wgsl */ `
struct Uniforms {
  resolution: vec2f,
  imageSize:  vec2f,
  pxSize:     f32,
  ditherType: u32,
  colorBack:  vec4f,
  colorFront: vec4f,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var srcTexture: texture_2d<f32>;
@group(0) @binding(2) var srcSampler: sampler;

// Bayer threshold matrices, scaled to 0..1. Layout matches paper-design's
// reference (https://github.com/paper-design/shaders) so the visual output
// is identical when the same pxSize and dither type are picked.
//
// Arrays live inside the lookup functions so we don't depend on
// module-scope const-array support, which some older Dawn builds reject.
fn bayer2(p: vec2u) -> f32 {
  let m = array<u32, 4>(
    0u, 2u,
    3u, 1u,
  );
  return f32(m[(p.y & 1u) * 2u + (p.x & 1u)]) / 4.0;
}
fn bayer4(p: vec2u) -> f32 {
  let m = array<u32, 16>(
    0u,  8u,  2u, 10u,
    12u, 4u, 14u,  6u,
    3u, 11u,  1u,  9u,
    15u, 7u, 13u,  5u,
  );
  return f32(m[(p.y & 3u) * 4u + (p.x & 3u)]) / 16.0;
}
fn bayer8(p: vec2u) -> f32 {
  let m = array<u32, 64>(
    0u, 32u,  8u, 40u,  2u, 34u, 10u, 42u,
    48u, 16u, 56u, 24u, 50u, 18u, 58u, 26u,
    12u, 44u,  4u, 36u, 14u, 46u,  6u, 38u,
    60u, 28u, 52u, 20u, 62u, 30u, 54u, 22u,
    3u, 35u, 11u, 43u,  1u, 33u,  9u, 41u,
    51u, 19u, 59u, 27u, 49u, 17u, 57u, 25u,
    15u, 47u,  7u, 39u, 13u, 45u,  5u, 37u,
    63u, 31u, 55u, 23u, 61u, 29u, 53u, 21u,
  );
  return f32(m[(p.y & 7u) * 8u + (p.x & 7u)]) / 64.0;
}

// hash21 from paper-design — cheap procedural random for "random" dither.
fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(0.3183099, 0.3678794)) + vec2f(0.1);
  q = q + vec2f(dot(q, q + vec2f(19.19)));
  return fract(q.x * q.y);
}

// "Cover" UV mapping — image fills the canvas, cropping the longer axis.
fn coverUv(uv: vec2f) -> vec2f {
  let canvasAspect = u.resolution.x / u.resolution.y;
  let imageAspect = u.imageSize.x / u.imageSize.y;
  var uvScale = vec2f(1.0);
  if (canvasAspect > imageAspect) {
    uvScale.y = imageAspect / canvasAspect;
  } else {
    uvScale.x = canvasAspect / imageAspect;
  }
  return (uv - vec2f(0.5)) * uvScale + vec2f(0.5);
}

@fragment
fn fs_main(
  @location(0) uv: vec2f,
  @builtin(position) fragCoord: vec4f,
) -> @location(0) vec4f {
  // Pixelize: each pxSize × pxSize block of canvas pixels samples the
  // source ONCE and is shaded as a single dither cell. This is what gives
  // the chunky retro look — no intensity ramp, just block-level sampling.
  let pxSize = max(u.pxSize, 1.0);
  let blockCoord = floor(fragCoord.xy / pxSize);
  let blockCenter = (blockCoord + vec2f(0.5)) * pxSize;
  let normalizedUv = blockCenter / u.resolution;

  let src = textureSample(srcTexture, srcSampler, coverUv(normalizedUv));

  // Perceptual luminance (Rec. 601). Drives the dither: brighter pixels are
  // more likely to land above threshold and pick up the front colour.
  let lum = dot(src.rgb, vec3f(0.299, 0.587, 0.114));

  // Look up the threshold for this block.
  let blockUi = vec2u(u32(blockCoord.x), u32(blockCoord.y));
  var dithering = 0.0;
  if (u.ditherType == 1u) {
    dithering = hash21(blockCenter);
  } else if (u.ditherType == 2u) {
    dithering = bayer2(blockUi);
  } else if (u.ditherType == 3u) {
    dithering = bayer4(blockUi);
  } else {
    dithering = bayer8(blockUi);
  }

  // Shift the threshold so 0.5 is the neutral midpoint, then binary step.
  // The result is exactly 0 or 1 — there is no intensity blending; the
  // local density of "front" pixels is what encodes the original image
  // brightness.
  let res = step(0.5, lum + dithering - 0.5);

  // Front-over-back compositing with premultiplied alphas, matching the
  // paper-design reference. With an opaque canvas the alpha collapses
  // out, but this keeps the output well-defined for translucent colours.
  let fg = u.colorFront.rgb * u.colorFront.a;
  let bg = u.colorBack.rgb * u.colorBack.a;
  var color = fg * res;
  var opacity = u.colorFront.a * res;
  color = color + bg * (1.0 - opacity);
  opacity = opacity + u.colorBack.a * (1.0 - opacity);

  return vec4f(color, opacity);
}
`;

const DITHER_WGSL = `${FULLSCREEN_TRIANGLE_VS}
${DITHER_FS}`;

export const ditherShader: ShaderModule<typeof DitherUniforms> = {
  uniforms: DitherUniforms,
  code: DITHER_WGSL,
};
