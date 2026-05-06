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
  /** Defaults to premultiplied-alpha over for transparent overlays. */
  blend?: GPUBlendState;
};

/**
 * Uniform values inferred from a `ShaderModule`'s struct schema, minus the
 * built-in `time` and `resolution` fields that `<ShaderMount/>` writes itself.
 */
export type UniformValues<U extends d.WgslStruct> =
  U extends d.WgslStruct<infer P>
    ? {
        [K in keyof P as K extends 'time' | 'resolution'
          ? never
          : K]: WgslDataToHost<P[K]>;
      }
    : never;

type WgslDataToHost<T> =
  T extends d.F32 | d.I32 | d.U32 ? number
  : T extends d.Vec2f | d.Vec2i | d.Vec2u ? readonly [number, number]
  : T extends d.Vec3f | d.Vec3i | d.Vec3u ? readonly [number, number, number]
  : T extends d.Vec4f | d.Vec4i | d.Vec4u
    ? readonly [number, number, number, number]
  : number | readonly number[];

/** Props every shader component (and `<ShaderMount/>`) accepts. */
export type ShaderViewProps = ViewProps & {
  /** Animation speed multiplier. 0 freezes the `time` uniform. Default 1. */
  speed?: number;
  /** Override the `time` uniform (in seconds). Disables the internal clock. */
  frame?: number;
  /** Render-target pixel ratio override. Defaults to `PixelRatio.get()`. */
  pixelRatio?: number;
};
