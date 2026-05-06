import type { ViewProps } from 'react-native';
import type { TgpuBindGroupLayout, TgpuFragmentFn } from 'typegpu';
import type * as d from 'typegpu/data';

/**
 * Bind group layout shared by every image shader: a uniform buffer at
 * `uniforms`, a 2D float texture at `sourceTex`, and a filtering sampler
 * at `sourceSampler`. Authors reference these inside their fragment
 * function via `layout.$.uniforms`, `layout.$.sourceTex`, and
 * `layout.$.sourceSampler` — no `@group(N) @binding(M)` strings.
 */
export type ImageShaderLayout<U extends d.WgslStruct> = TgpuBindGroupLayout<{
  uniforms: { uniform: U };
  sourceTex: { texture: d.WgslTexture2d<d.F32> };
  sourceSampler: { sampler: 'filtering' };
}>;

/**
 * A shader is a TypeGPU uniform schema plus a fragment-function factory.
 *
 * The factory is called once at pipeline build time with the bind group
 * layout, returning a typed `TgpuFragmentFn`. This keeps the uniform
 * struct, the bind group layout, and the shader implementation linked by
 * type — renaming a uniform field is a single TypeScript rename, not a
 * silent runtime mismatch between WGSL and JS.
 *
 * The fragment factory's return type is intentionally permissive
 * (`TgpuFragmentFn<any, any>`); the actual IO contract is enforced
 * structurally by the `tgpu.fragmentFn({...})` shell the author writes
 * inside the factory. The `in` it accepts must be a subset of
 * `common.fullScreenTriangle`'s output (`{ uv: d.Vec2f }`) plus any
 * fragment builtins (e.g. `d.builtin.position`); the `out` must be
 * `d.vec4f`.
 */
export type ShaderModule<U extends d.WgslStruct> = {
  uniforms: U;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fragment: (layout: ImageShaderLayout<U>) => TgpuFragmentFn<any, any>;
  topology?: GPUPrimitiveTopology;
  blend?: GPUBlendState;
};

/**
 * Uniform values inferred from a `ShaderModule`'s struct schema, minus the
 * built-in `resolution` field that `<ShaderMount/>` writes itself.
 */
export type UniformValues<U extends d.WgslStruct> = Omit<
  d.InferInput<U>,
  'resolution'
>;

/** Props every shader component (and `<ShaderMount/>`) accepts. */
export type ShaderViewProps = ViewProps & {
  /** Render-target pixel ratio override. Defaults to `PixelRatio.get()`. */
  pixelRatio?: number;
};
