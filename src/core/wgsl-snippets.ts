/**
 * Reusable WGSL snippets used by built-in shaders.
 *
 * Authors building a new shader can either:
 *  - paste these snippets into their own WGSL via template literals, or
 *  - write fully custom WGSL.
 *
 * Each snippet is a pure function block — drop it into a shader's WGSL once,
 * then call it from `fs_main`.
 */

/** Standard fullscreen-triangle vertex shader. Outputs `uv` in 0..1. */
export const FULLSCREEN_TRIANGLE_VS = /* wgsl */ `
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VsOut {
  // Three-vertex fullscreen triangle. Covers the viewport with no vertex buffer.
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f(-1.0,  1.0),
    vec2f( 3.0,  1.0),
  );
  var uv = array<vec2f, 3>(
    vec2f(0.0, 2.0),
    vec2f(0.0, 0.0),
    vec2f(2.0, 0.0),
  );
  var o: VsOut;
  o.position = vec4f(pos[vi], 0.0, 1.0);
  o.uv = uv[vi];
  return o;
}
`;

/** 4x4 ordered Bayer matrix threshold sampler (returns 0..1 per pixel). */
export const BAYER_4X4 = /* wgsl */ `
fn bayer4(p: vec2i) -> f32 {
  let m = array<f32, 16>(
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0,
  );
  let x = p.x & 3;
  let y = p.y & 3;
  return (m[y * 4 + x] + 0.5) / 16.0;
}
`;

/** 8x8 ordered Bayer matrix threshold sampler. */
export const BAYER_8X8 = /* wgsl */ `
fn bayer8(p: vec2i) -> f32 {
  let m = array<f32, 64>(
     0.0, 32.0,  8.0, 40.0,  2.0, 34.0, 10.0, 42.0,
    48.0, 16.0, 56.0, 24.0, 50.0, 18.0, 58.0, 26.0,
    12.0, 44.0,  4.0, 36.0, 14.0, 46.0,  6.0, 38.0,
    60.0, 28.0, 52.0, 20.0, 62.0, 30.0, 54.0, 22.0,
     3.0, 35.0, 11.0, 43.0,  1.0, 33.0,  9.0, 41.0,
    51.0, 19.0, 59.0, 27.0, 49.0, 17.0, 57.0, 25.0,
    15.0, 47.0,  7.0, 39.0, 13.0, 45.0,  5.0, 37.0,
    63.0, 31.0, 55.0, 23.0, 61.0, 29.0, 53.0, 21.0,
  );
  let x = p.x & 7;
  let y = p.y & 7;
  return (m[y * 8 + x] + 0.5) / 64.0;
}
`;

/** Cheap deterministic 2D hash, range -1..1. */
export const HASH_2D = /* wgsl */ `
fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z) * 2.0 - 1.0;
}
`;

/** Smooth 2D value-noise built on `hash21`. Returns 0..1. */
export const VALUE_NOISE_2D = /* wgsl */ `
fn valueNoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  let n = mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  return n * 0.5 + 0.5;
}
`;
