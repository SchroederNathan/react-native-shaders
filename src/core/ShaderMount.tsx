import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { PixelRatio, View, type LayoutChangeEvent } from 'react-native';
import { Canvas, type CanvasRef } from 'react-native-wgpu';
import type * as d from 'typegpu/data';

import { buildPipeline, type BuiltPipeline } from './pipeline';
import type { ShaderModule, ShaderViewProps, UniformValues } from './types';
import { useRenderLoop } from './useRenderLoop';
import { useTypeGPURoot } from './useTypeGPURoot';

export type ShaderMountProps<U extends d.WgslStruct> = ShaderViewProps & {
  shader: ShaderModule<U>;
  uniforms: UniformValues<U>;
};

/**
 * Shared base for every shader component in the package.
 *
 * Owns the `<Canvas/>`, TypeGPU root, render pipeline, uniform buffer, and
 * frame loop. Per-shader components (e.g. `<DitherShader/>`) are thin wrappers
 * that just compute `uniforms` from their props and forward them here.
 *
 * Power users can also use `<ShaderMount/>` directly with their own
 * `ShaderModule` for one-off custom shaders.
 */
function ShaderMountInner<U extends d.WgslStruct>(
  {
    shader,
    uniforms,
    speed = 1,
    frame,
    pixelRatio,
    onLayout,
    style,
    ...rest
  }: ShaderMountProps<U>,
  ref: React.ForwardedRef<View>,
): React.ReactElement {
  const canvasRef = useRef<CanvasRef>(null);
  const viewRef = useRef<View>(null);
  useImperativeHandle(ref, () => viewRef.current as View);

  const rootState = useTypeGPURoot();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const dpr = pixelRatio ?? PixelRatio.get();
  const pxW = size ? Math.max(1, Math.round(size.w * dpr)) : 0;
  const pxH = size ? Math.max(1, Math.round(size.h * dpr)) : 0;

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setSize((prev) =>
        prev && prev.w === width && prev.h === height
          ? prev
          : { w: width, h: height },
      );
      onLayout?.(e);
    },
    [onLayout],
  );

  const pipelineRef = useRef<BuiltPipeline<U> | null>(null);
  const formatRef = useRef<GPUTextureFormat | null>(null);

  // Configure context + (re)build pipeline whenever the device, shader, or
  // canvas size changes. Re-creating the pipeline is cheap; reconfiguring the
  // surface is required after a size change.
  useEffect(() => {
    if (rootState.status !== 'ready' || !canvasRef.current) return;
    if (pxW === 0 || pxH === 0) return;

    const ctx = canvasRef.current.getContext('webgpu');
    if (!ctx) return;

    const format = navigator.gpu.getPreferredCanvasFormat();
    formatRef.current = format;

    ctx.configure({
      device: rootState.device,
      format,
      alphaMode: 'premultiplied',
    });

    pipelineRef.current?.destroy();
    pipelineRef.current = buildPipeline(rootState.root, shader, format);

    return () => {
      pipelineRef.current?.destroy();
      pipelineRef.current = null;
    };
  }, [rootState, shader, pxW, pxH]);

  // Track latest uniforms in a ref so the render loop reads fresh values
  // without resubscribing every frame.
  const uniformsRef = useRef(uniforms);
  uniformsRef.current = uniforms;

  const renderFrame = useCallback(
    (time: number) => {
      if (rootState.status !== 'ready') return;
      const built = pipelineRef.current;
      const ctx = canvasRef.current?.getContext('webgpu');
      if (!built || !ctx) return;

      const data = {
        ...(uniformsRef.current as Record<string, unknown>),
        time,
        resolution: [pxW, pxH] as const,
      };
      built.uniformBuffer.write(data as never);

      const view = ctx.getCurrentTexture().createView();
      const encoder = rootState.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(built.pipeline);
      pass.setBindGroup(0, built.bindGroup);
      pass.draw(3);
      pass.end();

      rootState.device.queue.submit([encoder.finish()]);
      ctx.present();
    },
    [rootState, pxW, pxH],
  );

  useRenderLoop({
    enabled: rootState.status === 'ready' && pxW > 0 && pxH > 0,
    onFrame: renderFrame,
    speed,
    frame,
  });

  // Render error message inline so misconfiguration is loud, not silent.
  const error =
    rootState.status === 'error' ? rootState.error.message : null;

  const containerStyle = useMemo(
    () => [{ overflow: 'hidden' as const }, style],
    [style],
  );

  return (
    <View
      ref={viewRef}
      style={containerStyle}
      onLayout={handleLayout}
      {...rest}
    >
      {size && (
        <Canvas
          ref={canvasRef}
          style={{ width: size.w, height: size.h }}
          transparent
        />
      )}
      {error && __DEV__ ? (
        <ShaderError message={error} />
      ) : null}
    </View>
  );
}

function ShaderError({ message }: { message: string }) {
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255,0,0,0.15)',
      }}
      accessibilityLabel={`react-native-shaders error: ${message}`}
    />
  );
}

export const ShaderMount = forwardRef(ShaderMountInner) as <
  U extends d.WgslStruct,
>(
  props: ShaderMountProps<U> & { ref?: React.ForwardedRef<View> },
) => React.ReactElement;
