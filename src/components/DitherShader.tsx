import React, { memo, useMemo } from 'react';
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
import { useImageSourceTexture } from './useImageSourceTexture';
import { useVideoSourceTexture } from './useVideoSourceTexture';

export type DitherShaderSource =
  | string
  | { uri: string }
  | number; // result of `require(...)` — RN resolves it to a URI at runtime

export type DitherType = 'random' | '2x2' | '4x4' | '8x8';

export type DitherShaderKind = 'auto' | 'image' | 'video';

export type DitherShaderProps = ShaderViewProps & {
  /**
   * Image or video to be dithered. Accepts a remote URL string, an
   * `{ uri }` object, or a `require(...)`'d local asset — same semantics
   * as `<Image source>`. Video URIs are detected by extension (see
   * `kind`); install `expo-video-thumbnails` to enable video playback.
   */
  source: DitherShaderSource;
  /**
   * How to interpret `source`. `'auto'` (default) sniffs the URI's
   * extension — `.mp4 .mov .m4v .webm .avi` are treated as video,
   * anything else as image. Set explicitly to override.
   */
  kind?: DitherShaderKind;
  /**
   * Frames per second for video playback. Default `15`. The video is
   * pre-decoded into bitmaps at component mount; higher fps means more
   * frames decoded and more memory.
   */
  videoFps?: number;
  /**
   * Hard cap on pre-decoded video frames. Default `120`. Acts as a memory
   * fuse for long videos — playback loops earlier than the source. Worst
   * case bitmap memory ≈ `maxVideoFrames × videoWidth × videoHeight × 4`
   * bytes.
   */
  maxVideoFrames?: number;
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

const DITHER_TYPE_MAP: Record<DitherType, number> = {
  random: DITHER_TYPE_RANDOM,
  '2x2': DITHER_TYPE_2X2,
  '4x4': DITHER_TYPE_4X4,
  '8x8': DITHER_TYPE_8X8,
};

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|avi)(\?.*)?$/i;

/**
 * Renders an image or video dithered to two colours through a Bayer (or
 * random) threshold matrix — a faithful port of paper-design/shaders'
 * dithering algorithm, adapted to sample a media texture instead of a
 * procedural pattern.
 *
 * The dither field is anchored to the canvas pixel grid, not the source.
 * For animated sources (videos, paged images) the underlying pixels travel
 * through a static threshold field — this is the classic retro-CRT look
 * and exactly the behaviour you want when dithering video frames.
 *
 * Video playback pre-decodes a bounded set of frames at mount via
 * `expo-video-thumbnails` (an optional peer dependency), then cycles them
 * at `videoFps`. See `videoFps` and `maxVideoFrames` for memory tuning.
 *
 * @example
 * ```tsx
 * <DitherShader
 *   source="https://example.com/clip.mp4"
 *   style={{ width: 360, height: 360 }}
 *   videoFps={15}
 *   type="8x8"
 * />
 * ```
 */
export const DitherShader = memo(function DitherShader({
  source,
  kind = 'auto',
  videoFps = 15,
  maxVideoFrames = 120,
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

  const resolvedKind: 'image' | 'video' = useMemo(() => {
    if (kind !== 'auto') return kind;
    return sourceUri && VIDEO_EXT.test(sourceUri) ? 'video' : 'image';
  }, [kind, sourceUri]);

  // Always call both hooks (rules of hooks). The inactive one receives a
  // null URI and short-circuits without allocating GPU resources.
  const imageLoaded = useImageSourceTexture(
    resolvedKind === 'image' ? sourceUri : null,
    rootState,
  );
  const videoLoaded = useVideoSourceTexture(
    resolvedKind === 'video' ? sourceUri : null,
    rootState,
    videoFps,
    maxVideoFrames,
  );

  const active =
    resolvedKind === 'video'
      ? {
          texture: videoLoaded.texture,
          width: videoLoaded.width,
          height: videoLoaded.height,
          frameVersion: videoLoaded.frameVersion,
        }
      : {
          texture: imageLoaded?.texture ?? null,
          width: imageLoaded?.width ?? 0,
          height: imageLoaded?.height ?? 0,
          frameVersion: 0,
        };

  const uniforms = useMemo(() => {
    const [br, bg, bb, ba] = parseColor(colorBack);
    const [fr, fg, fb, fa] = parseColor(colorFront);
    return {
      imageSize: d.vec2f(active.width || 1, active.height || 1),
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
  }, [
    size,
    type,
    colorBack,
    colorFront,
    scale,
    rotation,
    active.width,
    active.height,
  ]);

  return (
    <ShaderMount
      shader={ditherShader}
      uniforms={uniforms}
      sourceTexture={active.texture}
      frameVersion={active.frameVersion}
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
