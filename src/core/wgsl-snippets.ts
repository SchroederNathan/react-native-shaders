/**
 * Reusable WGSL snippets for shader authors. Currently tiny on purpose —
 * shaders in this package are short enough that inlining their helpers
 * keeps each one readable end-to-end. The fullscreen-triangle vertex
 * shader is the only piece every fragment-only shader needs.
 */

/** Standard fullscreen-triangle vertex shader. Outputs `uv` in 0..1 with
 * (0,0) at the top-left, matching WebGPU's framebuffer convention. */
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
