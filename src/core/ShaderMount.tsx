import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import {
  Canvas,
  type CanvasRef,
  type RNCanvasContext,
} from 'react-native-wgpu';
import type * as d from 'typegpu/data';
import { vec2f } from 'typegpu/data';

import { buildPipeline, type BuiltPipeline } from './pipeline';
import type { ShaderModule, ShaderViewProps, UniformValues } from './types';
import { useTypeGPURoot } from './useTypeGPURoot';

export type ShaderMountProps<U extends d.WgslStruct> = ShaderViewProps & {
  shader: ShaderModule<U>;
  uniforms: UniformValues<U>;
  /**
   * Source texture bound to the shader's `sourceTex` entry. `null` while
   * the source is loading; the canvas stays blank in that case.
   */
  sourceTexture: GPUTexture | null;
  /**
   * Opt-in render trigger for animated sources that mutate `sourceTexture`
   * in place (e.g. video playback). Bumping this counter forces a re-render
   * even though the texture object identity is stable. Leave undefined for
   * static sources.
   */
  frameVersion?: number;
};

/**
 * Shared base for every shader component in the package.
 *
 * Owns the `<Canvas/>`, render pipeline, uniform buffer, and frame loop.
 * Per-shader components (e.g. `<DitherShader/>`) load source content into a
 * GPUTexture and hand it down here; this component never touches image
 * decoding or aspect-ratio math.
 */
function ShaderMountInner<U extends d.WgslStruct>(
  {
    shader,
    uniforms,
    sourceTexture,
    frameVersion,
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

  // react-native-wgpu configures the swapchain at the View's CSS-pixel size,
  // so `fragCoord` in WGSL is in CSS pixels. The `resolution` uniform we
  // pass to the shader has to match that unit — passing physical pixels
  // would put the shader's pixelization math out of step with the actual
  // texture it's rendering into. `pixelRatio` is preserved on the prop
  // type for future shaders that want to sub-pixel-sample.
  const pxW = size ? Math.max(1, Math.round(size.w)) : 0;
  const pxH = size ? Math.max(1, Math.round(size.h)) : 0;

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
  // See ShaderMount history note: react-native-wgpu's getContext('webgpu')
  // allocates a fresh JS wrapper each call (RNWebGPU.h:42). Cache it once
  // per configured surface so the swapchain stays put.
  const ctxRef = useRef<RNCanvasContext | null>(null);
  const samplerRef = useRef<GPUSampler | null>(null);

  useEffect(() => {
    if (rootState.status !== 'ready' || !canvasRef.current) return;
    if (pxW === 0 || pxH === 0) return;
    if (!sourceTexture) return;

    let ctx: RNCanvasContext | null;
    try {
      ctx = canvasRef.current.getContext('webgpu');
    } catch (err) {
      if (__DEV__) {
        console.error('[react-native-shaders] getContext failed', err);
      }
      return;
    }
    if (!ctx) return;
    ctxRef.current = ctx;

    const format = navigator.gpu.getPreferredCanvasFormat();

    if (!samplerRef.current) {
      samplerRef.current = rootState.device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      });
    }

    try {
      ctx.configure({
        device: rootState.device,
        format,
        // Opaque output — the shader composites the source content into the
        // canvas itself, so we don't need the OS compositor to blend.
        alphaMode: 'opaque',
      });
      pipelineRef.current?.destroy();
      pipelineRef.current = buildPipeline(
        rootState.root,
        shader,
        format,
        sourceTexture.createView(),
        samplerRef.current,
      );
    } catch (err) {
      if (__DEV__) {
        console.error('[react-native-shaders] pipeline setup failed', err);
      }
      return;
    }

    return () => {
      pipelineRef.current?.destroy();
      pipelineRef.current = null;
      ctxRef.current = null;
    };
  }, [rootState, shader, pxW, pxH, sourceTexture]);

  const uniformsRef = useRef(uniforms);
  uniformsRef.current = uniforms;

  // Render whenever any input changes. We don't run a continuous rAF loop
  // because the dither output is purely a function of (uniforms, source) —
  // re-presenting the same frame on a clock just burns the GPU. For animated
  // sources that mutate `sourceTexture` in place (e.g. video playback), the
  // parent bumps `frameVersion` to retrigger this effect without invalidating
  // the cached pipeline/bind group above.
  useEffect(() => {
    if (rootState.status !== 'ready') return;
    const built = pipelineRef.current;
    const ctx = ctxRef.current;
    if (!built || !ctx) return;

    try {
      // TypeScript can't prove that re-adding `resolution` to
      // `Omit<InferInput<U>, 'resolution'>` reproduces `InferInput<U>` for
      // a generic `U` — the cast is a single, explicit boundary instead of
      // sprinkling `as never` through the call. The shape is enforced by
      // `UniformValues<U>` everywhere else.
      built.uniformBuffer.write({
        ...uniformsRef.current,
        resolution: vec2f(pxW, pxH),
      } as d.InferInput<U>);

      built.pipeline
        .with(built.bindGroup)
        .withColorAttachment({
          view: ctx,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        })
        .draw(3);
      ctx.present();
    } catch (err) {
      if (__DEV__) {
        console.error('[react-native-shaders] render failed', err);
      }
    }
  }, [rootState, uniforms, pxW, pxH, sourceTexture, frameVersion]);

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
        />
      )}
      {error && __DEV__ ? <ShaderError message={error} /> : null}
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
