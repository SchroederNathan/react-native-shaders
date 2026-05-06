import type { TgpuBuffer, TgpuRoot } from 'typegpu';
import type * as d from 'typegpu/data';

import type { ShaderModule } from './types';

export type BuiltPipeline<U extends d.WgslStruct> = {
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: TgpuBuffer<U>;
  destroy: () => void;
};

/**
 * Builds a render pipeline from a `ShaderModule` against a presented texture
 * format. Allocates a single uniform buffer (typed by the module's `d.struct`)
 * and binds it at group 0 / binding 0, plus the source texture at binding 1
 * and a linear sampler at binding 2 — the standard layout for image-sampling
 * post-process shaders.
 */
export function buildPipeline<U extends d.WgslStruct>(
  root: TgpuRoot,
  shader: ShaderModule<U>,
  format: GPUTextureFormat,
  sourceTextureView: GPUTextureView,
  sourceSampler: GPUSampler,
): BuiltPipeline<U> {
  const { device } = root;

  const module = device.createShaderModule({ code: shader.code });
  const uniformBuffer = root.createBuffer(shader.uniforms).$usage('uniform');

  const layout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '2d' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [layout],
  });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module,
      entryPoint: shader.vertexEntry ?? 'vs_main',
    },
    fragment: {
      module,
      entryPoint: shader.fragmentEntry ?? 'fs_main',
      targets: [{ format, blend: shader.blend }],
    },
    primitive: {
      topology: shader.topology ?? 'triangle-list',
    },
  });

  const bindGroup = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: root.unwrap(uniformBuffer) } },
      { binding: 1, resource: sourceTextureView },
      { binding: 2, resource: sourceSampler },
    ],
  });

  return {
    pipeline,
    bindGroup,
    uniformBuffer,
    destroy: () => uniformBuffer.destroy(),
  };
}
