import tgpu, {
  type TgpuBindGroup,
  type TgpuBuffer,
  type TgpuRenderPipeline,
  type TgpuRoot,
  type Uniform,
} from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import * as d from 'typegpu/data';

import type { ImageShaderLayout, ShaderModule } from './types';

// Pipeline narrowed to a single `d.vec4f` color target — matches every
// image shader's fragment output. This keeps `withColorAttachment(...)`
// type-safe on `BuiltPipeline` without an `any`-cast at the call site.
type ImagePipeline = TgpuRenderPipeline<d.Vec4f>;

export type BuiltPipeline<U extends d.WgslStruct> = {
  pipeline: ImagePipeline;
  bindGroup: TgpuBindGroup;
  uniformBuffer: TgpuBuffer<U> & Uniform;
  layout: ImageShaderLayout<U>;
  destroy: () => void;
};

/**
 * Builds a TypeGPU render pipeline from a `ShaderModule`. Allocates the
 * uniform buffer typed by the module's `d.struct`, binds it alongside the
 * source texture and a linear sampler at the canonical image-shader layout
 * (`uniforms`, `sourceTex`, `sourceSampler`), and wires `common.fullScreenTriangle`
 * as the vertex stage so the fragment runs over the entire viewport.
 *
 * TypeGPU's API is heavily specialised on concrete schema types; the casts
 * inside this function are at the boundaries where its conditional types
 * (`ValidateBufferSchema`, `IsValidUniformSchema`, etc.) cannot resolve
 * over a generic `U`. Runtime behaviour is fully type-safe — the layout
 * keys, uniform fields, and texture/sampler types are all enforced
 * elsewhere in this file.
 */
export function buildPipeline<U extends d.WgslStruct>(
  root: TgpuRoot,
  shader: ShaderModule<U>,
  format: GPUTextureFormat,
  sourceTextureView: GPUTextureView,
  sourceSampler: GPUSampler,
): BuiltPipeline<U> {
  const layout = tgpu.bindGroupLayout({
    uniforms: { uniform: shader.uniforms },
    sourceTex: { texture: d.texture2d(d.f32) },
    sourceSampler: { sampler: 'filtering' as const },
  }) as unknown as ImageShaderLayout<U>;

  const uniformBuffer = (
    root.createBuffer(shader.uniforms as never) as unknown as TgpuBuffer<U>
  ).$usage('uniform' as never) as unknown as TgpuBuffer<U> & Uniform;

  const pipeline = root.createRenderPipeline({
    vertex: fullScreenTriangle,
    fragment: shader.fragment(layout) as never,
    targets: { format, blend: shader.blend },
    primitive: { topology: shader.topology ?? 'triangle-list' },
  }) as unknown as ImagePipeline;

  const bindGroup = root.createBindGroup(layout as never, {
    uniforms: uniformBuffer,
    sourceTex: sourceTextureView,
    sourceSampler,
  } as never) as unknown as TgpuBindGroup;

  return {
    pipeline,
    bindGroup,
    uniformBuffer,
    layout,
    destroy: () => uniformBuffer.destroy(),
  };
}
