import React, { memo, useEffect, useMemo, useState } from 'react';
import * as d from 'typegpu/data';

import { ShaderMount } from '../core/ShaderMount';
import { parseColor } from '../core/color';
import type { ShaderViewProps } from '../core/types';
import {
  DITHER_TYPE_2X2,
  DITHER_TYPE_4X4,
  DITHER_TYPE_8X8,
  DITHER_TYPE_RANDOM,
  ditherShader,
} from '../shaders/dither';
import { useTypeGPURoot } from '../core/useTypeGPURoot';

export type DitherShaderSource =
  | string
  | { uri: string }
  | number; // result of `require(...)` — RN resolves it to a URI at runtime

export type DitherType = 'random' | '2x2' | '4x4' | '8x8';

export type DitherShaderProps = ShaderViewProps & {
  /**
   * Image to be dithered. Accepts a remote URL string, an `{ uri }` object,
   * or a `require(...)`'d local asset — same semantics as `<Image source>`.
   */
  source: DitherShaderSource;
  /**
   * Dither cell size in CSS pixels (multiplied internally by the device
   * pixel ratio). Larger values give a chunkier, more obviously pixelated
   * look. Default 2.
   */
  size?: number;
  /**
   * Dither pattern. `'8x8'` is the default and gives the smoothest tonal
   * range; `'2x2'` is the coarsest; `'random'` uses a hash-based threshold
   * for a noisier, less periodic look. Default `'8x8'`.
   */
  type?: DitherType;
  /** CSS colour string for the "0" cells. Default `#000`. */
  colorBack?: string;
  /** CSS colour string for the "1" / ink cells. Default `#fff`. */
  colorFront?: string;
  /**
   * Image zoom factor inside the canvas. `1` = no zoom (default). Values
   * greater than 1 zoom in; values less than 1 zoom out (edge texels stretch
   * via clamp-to-edge sampling). The dither cell grid stays canvas-aligned.
   */
  scale?: number;
  /**
   * Rotation of the image content, in degrees. Default `0`. Rotates around
   * the image center; the dither grid stays axis-aligned to the canvas.
   */
  rotation?: number;
};

type LoadedTexture = {
  texture: GPUTexture;
  width: number;
  height: number;
};

const DITHER_TYPE_MAP: Record<DitherType, number> = {
  random: DITHER_TYPE_RANDOM,
  '2x2': DITHER_TYPE_2X2,
  '4x4': DITHER_TYPE_4X4,
  '8x8': DITHER_TYPE_8X8,
};

/**
 * Renders an image dithered to two colours through a Bayer (or random)
 * threshold matrix — a faithful port of paper-design/shaders' dithering
 * algorithm, adapted to sample an image instead of a procedural pattern.
 *
 * The dither field is anchored to the canvas pixel grid, not the source.
 * For animated sources (videos, paged images) the underlying pixels travel
 * through a static threshold field — this is the classic retro-CRT look
 * and exactly the behaviour you want when dithering video frames.
 *
 * @example
 * ```tsx
 * <DitherShader
 *   source="https://example.com/photo.jpg"
 *   style={{ width: 360, height: 360 }}
 *   size={2}
 *   type="8x8"
 *   colorBack="#000000"
 *   colorFront="#ffffff"
 * />
 * ```
 */
export const DitherShader = memo(function DitherShader({
  source,
  size = 2,
  type = '8x8',
  colorBack = '#000',
  colorFront = '#fff',
  scale = 1,
  rotation = 0,
  pixelRatio,
  ...rest
}: DitherShaderProps) {
  const rootState = useTypeGPURoot();
  const sourceUri = useMemo(() => resolveSource(source), [source]);

  const [loaded, setLoaded] = useState<LoadedTexture | null>(null);

  useEffect(() => {
    if (rootState.status !== 'ready' || !sourceUri) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(sourceUri);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        if (cancelled) return;

        const texture = rootState.device.createTexture({
          size: [bitmap.width, bitmap.height, 1],
          format: 'rgba8unorm',
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
        });
        rootState.device.queue.copyExternalImageToTexture(
          { source: bitmap },
          { texture },
          [bitmap.width, bitmap.height],
        );
        if (cancelled) return;
        setLoaded({ texture, width: bitmap.width, height: bitmap.height });
      } catch (err) {
        if (__DEV__) {
          console.error('[react-native-shaders] image load failed', err);
        }
      }
    })();

    return () => {
      cancelled = true;
      // Don't call texture.destroy() — the GPUBindGroup holds a reference
      // through the rendering chain and Dawn reclaims memory on GC.
    };
  }, [rootState, sourceUri]);

  const uniforms = useMemo(() => {
    const [br, bg, bb, ba] = parseColor(colorBack);
    const [fr, fg, fb, fa] = parseColor(colorFront);
    return {
      imageSize: d.vec2f(loaded?.width ?? 1, loaded?.height ?? 1),
      // pxSize matches `fragCoord`'s units in the shader. react-native-wgpu
      // configures the swapchain at CSS pixels, so we pass `size` in CSS
      // pixels directly — no DPR multiplier (paper-design multiplies by DPR
      // because their canvas is configured at physical pixels; ours isn't).
      pxSize: Math.max(1, size),
      ditherType: DITHER_TYPE_MAP[type] ?? DITHER_TYPE_8X8,
      colorBack: d.vec4f(br, bg, bb, ba),
      colorFront: d.vec4f(fr, fg, fb, fa),
      scale,
      rotation: (rotation * Math.PI) / 180,
    };
  }, [size, type, colorBack, colorFront, scale, rotation, loaded]);

  return (
    <ShaderMount
      shader={ditherShader}
      uniforms={uniforms}
      sourceTexture={loaded?.texture ?? null}
      pixelRatio={pixelRatio}
      {...rest}
    />
  );
});

function resolveSource(source: DitherShaderSource): string | null {
  if (typeof source === 'string') return source;
  if (typeof source === 'object' && 'uri' in source) return source.uri;
  if (typeof source === 'number') {
    // require(...)'d local asset — defer to RN's image resolver. Imported
    // lazily so the dither shader doesn't hard-require Image at module load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Image } = require('react-native');
    const resolved = Image.resolveAssetSource(source);
    return resolved?.uri ?? null;
  }
  return null;
}
