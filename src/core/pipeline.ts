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
 * and binds it at group 0 / binding 0.
 *
 * Premultiplied-alpha "over" blending is the default so transparent shaders
 * (e.g. `<DitherShader/>`) composite correctly over RN views beneath.
 */
export function buildPipeline<U extends d.WgslStruct>(
  root: TgpuRoot,
  shader: ShaderModule<U>,
  format: GPUTextureFormat,
): BuiltPipeline<U> {
  const { device } = root;

  const code = shader.code;
  const module = device.createShaderModule({ code });

  const uniformBuffer = root.createBuffer(shader.uniforms).$usage('uniform');

  const layout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility:
          GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
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
      targets: [
        {
          format,
          blend: shader.blend ?? PREMULTIPLIED_OVER,
        },
      ],
    },
    primitive: {
      topology: shader.topology ?? 'triangle-list',
    },
  });

  const bindGroup = device.createBindGroup({
    layout,
    entries: [
      {
        binding: 0,
        resource: { buffer: root.unwrap(uniformBuffer) },
      },
    ],
  });

  const destroy = () => {
    uniformBuffer.destroy();
  };

  return { pipeline, bindGroup, uniformBuffer, destroy };
}

/** Premultiplied-alpha "over" blend — the default for transparent overlays. */
const PREMULTIPLIED_OVER: GPUBlendState = {
  color: {
    srcFactor: 'one',
    dstFactor: 'one-minus-src-alpha',
    operation: 'add',
  },
  alpha: {
    srcFactor: 'one',
    dstFactor: 'one-minus-src-alpha',
    operation: 'add',
  },
};
