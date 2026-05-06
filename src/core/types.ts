import type { ViewProps } from 'react-native';
import type * as d from 'typegpu/data';

/**
 * A shader is a fully-resolved WGSL module plus a TypeGPU uniform schema.
 *
 * Authors write the shader in WGSL (or TGSL via `tgpu.resolve(...)`), declare
 * the uniform layout once with `d.struct({...})`, and let the props -> uniforms
 * mapping in their component stay type-safe end to end.
 *
 * `<ShaderMount/>` builds the GPU pipeline once per `ShaderModule` reference.
 */
export type ShaderModule<U extends d.WgslStruct = d.WgslStruct> = {
  /** TypeGPU struct describing the uniform buffer layout. */
  uniforms: U;
  /** Full WGSL source containing both vertex and fragment entry points. */
  code: string;
  /** Vertex entry point name. Defaults to `vs_main`. */
  vertexEntry?: string;
  /** Fragment entry point name. Defaults to `fs_main`. */
  fragmentEntry?: string;
  /** Defaults to `triangle-list`. */
  topology?: GPUPrimitiveTopology;
  /** Optional blend state. Default is no blend (opaque output). */
  blend?: GPUBlendState;
};

/**
 * Uniform values inferred from a `ShaderModule`'s struct schema, minus the
 * built-in `resolution` field that `<ShaderMount/>` writes itself.
 */
export type UniformValues<U extends d.WgslStruct> =
  U extends d.WgslStruct<infer P>
    ? {
        [K in keyof P as K extends 'resolution' ? never : K]: WgslDataToHost<
          P[K]
        >;
      }
    : never;

type WgslDataToHost<T> =
  T extends d.F32 | d.I32 | d.U32 ? number
  : T extends d.Vec2f | d.Vec2i | d.Vec2u ? d.v2f | d.v2i | d.v2u
  : T extends d.Vec3f | d.Vec3i | d.Vec3u ? d.v3f | d.v3i | d.v3u
  : T extends d.Vec4f | d.Vec4i | d.Vec4u ? d.v4f | d.v4i | d.v4u
  : unknown;

/** Props every shader component (and `<ShaderMount/>`) accepts. */
export type ShaderViewProps = ViewProps & {
  /** Render-target pixel ratio override. Defaults to `PixelRatio.get()`. */
  pixelRatio?: number;
};
