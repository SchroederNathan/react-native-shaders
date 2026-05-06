import * as d from 'typegpu/data';

import {
  BAYER_8X8,
  FULLSCREEN_TRIANGLE_VS,
  HASH_2D,
  VALUE_NOISE_2D,
} from '../core/wgsl-snippets';
import type { ShaderModule } from '../core/types';

/**
 * Uniform layout for the dither shader.
 *
 * `time` and `resolution` are written automatically by `<ShaderMount/>` every
 * frame; component authors only set the remaining fields.
 */
export const DitherUniforms = d.struct({
  time: d.f32,
  resolution: d.vec2f,
  scale: d.f32,
  intensity: d.f32,
  speed: d.f32,
  color: d.vec4f,
});

const DITHER_FS = /* wgsl */ `
struct Uniforms {
  time:       f32,
  resolution: vec2f,
  scale:      f32,
  intensity:  f32,
  speed:      f32,
  color:      vec4f,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Pixel coordinate sampled at the dither cell pitch in CSS pixels.
  let px = uv * u.resolution / max(u.scale, 1.0);
  let cell = vec2i(floor(px));

  // A small slow-moving value noise jitters the threshold so the pattern
  // shimmers instead of staying perfectly static.
  let n = valueNoise(px * 0.15 + vec2f(u.time * 0.6));
  let threshold = bayer8(cell) * 0.9 + n * 0.1;

  // Wide smoothstep around 0.5 means intensity 0 -> fully transparent,
  // intensity 1 -> hard binary dither.
  let halfBand = (1.0 - clamp(u.intensity, 0.0, 1.0)) * 0.5 + 0.001;
  let a = 1.0 - smoothstep(0.5 - halfBand, 0.5 + halfBand, threshold);

  let outA = a * u.color.a;
  return vec4f(u.color.rgb * outA, outA);
}
`;

const DITHER_WGSL = `${FULLSCREEN_TRIANGLE_VS}
${HASH_2D}
${VALUE_NOISE_2D}
${BAYER_8X8}
${DITHER_FS}`;

export const ditherShader: ShaderModule<typeof DitherUniforms> = {
  uniforms: DitherUniforms,
  code: DITHER_WGSL,
};
