import { useEffect, useRef, useState } from 'react';

import type { useTypeGPURoot } from '../core/useTypeGPURoot';

type VideoSourceState = {
  texture: GPUTexture | null;
  width: number;
  height: number;
  frameVersion: number;
  loading: boolean;
};

const INITIAL: VideoSourceState = {
  texture: null,
  width: 0,
  height: 0,
  frameVersion: 0,
  loading: false,
};

let warnedMissingThumbnails = false;

type ThumbnailResult = { uri: string; width: number; height: number };

/**
 * Pre-decodes a bounded set of frames from a video URI via
 * `expo-video-thumbnails`, then ticks through them on a `setInterval` at
 * `fps`. Each tick uploads the next bitmap into a single reused
 * `GPUTexture` and bumps `frameVersion` so `<ShaderMount/>` re-renders.
 *
 * Memory: one `ImageBitmap` per pre-decoded frame at the video's native
 * thumbnail resolution. Worst case ≈ `maxFrames × W × H × 4` bytes. Tune
 * `fps` and `maxFrames` for long or high-resolution videos.
 *
 * Returns `{ texture: null, loading: true }` while the first frame is
 * being decoded, then transitions as more frames stream in. Playback
 * starts as soon as the first frame is ready — subsequent frames join
 * the loop as they finish decoding.
 */
export function useVideoSourceTexture(
  uri: string | null,
  rootState: ReturnType<typeof useTypeGPURoot>,
  fps: number,
  maxFrames: number,
): VideoSourceState {
  const [state, setState] = useState<VideoSourceState>(INITIAL);

  // Per-effect mutable refs. Recreated on every effect run; the cleanup
  // closes over the same instances so we never leak across uri changes.
  const framesRef = useRef<ImageBitmap[]>([]);
  const indexRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textureRef = useRef<GPUTexture | null>(null);

  useEffect(() => {
    if (!uri || rootState.status !== 'ready') {
      setState(INITIAL);
      return;
    }

    let VideoThumbnails: {
      getThumbnailAsync: (
        uri: string,
        opts?: { time?: number; quality?: number },
      ) => Promise<ThumbnailResult>;
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      VideoThumbnails = require('expo-video-thumbnails');
    } catch {
      if (__DEV__ && !warnedMissingThumbnails) {
        warnedMissingThumbnails = true;
        console.error(
          '[react-native-shaders] video sources require expo-video-thumbnails. ' +
            'Install it with: npx expo install expo-video-thumbnails',
        );
      }
      setState(INITIAL);
      return;
    }

    let cancelled = false;
    framesRef.current = [];
    indexRef.current = 0;
    textureRef.current = null;
    setState({ ...INITIAL, loading: true });

    const device = rootState.device;
    const frameMs = 1000 / Math.max(1, fps);

    const startTicker = () => {
      if (intervalRef.current != null) return;
      intervalRef.current = setInterval(() => {
        const tex = textureRef.current;
        const frames = framesRef.current;
        if (!tex || frames.length === 0) return;
        const bitmap = frames[indexRef.current % frames.length];
        if (!bitmap) return;
        indexRef.current = (indexRef.current + 1) % Math.max(1, frames.length);
        try {
          device.queue.copyExternalImageToTexture(
            { source: bitmap },
            { texture: tex },
            [tex.width, tex.height],
          );
        } catch (err) {
          if (__DEV__) {
            console.error('[react-native-shaders] frame upload failed', err);
          }
          return;
        }
        setState((prev) => ({
          ...prev,
          frameVersion: prev.frameVersion + 1,
        }));
      }, frameMs);
    };

    (async () => {
      let textureReady = false;

      for (let i = 0; i < maxFrames; i++) {
        if (cancelled) return;
        const timeMs = Math.round(i * frameMs);

        let thumb: ThumbnailResult;
        try {
          thumb = await VideoThumbnails.getThumbnailAsync(uri, {
            time: timeMs,
            quality: 0.7,
          });
        } catch {
          // Past end of video — or decode error. Stop sampling and play
          // whatever we have. If we have nothing, the canvas stays blank.
          break;
        }
        if (cancelled) return;

        let bitmap: ImageBitmap;
        try {
          const response = await fetch(thumb.uri);
          const buffer = await response.arrayBuffer();
          bitmap = await createImageBitmap(buffer);
        } catch (err) {
          if (__DEV__) {
            console.error(
              '[react-native-shaders] thumbnail decode failed',
              err,
            );
          }
          continue;
        }
        if (cancelled) {
          bitmap.close?.();
          return;
        }

        if (!textureReady) {
          // Allocate the reused texture from the first decoded frame.
          // All subsequent frames are assumed to match these dimensions
          // (videos don't change resolution mid-stream).
          const texture = device.createTexture({
            size: [bitmap.width, bitmap.height, 1],
            format: 'rgba8unorm',
            usage:
              GPUTextureUsage.TEXTURE_BINDING |
              GPUTextureUsage.COPY_DST |
              GPUTextureUsage.RENDER_ATTACHMENT,
          });
          textureRef.current = texture;
          textureReady = true;

          // Seed frame 0 immediately so the canvas isn't blank while the
          // rest of the frames decode.
          try {
            device.queue.copyExternalImageToTexture(
              { source: bitmap },
              { texture },
              [bitmap.width, bitmap.height],
            );
          } catch (err) {
            if (__DEV__) {
              console.error(
                '[react-native-shaders] initial frame upload failed',
                err,
              );
            }
          }

          framesRef.current.push(bitmap);
          setState({
            texture,
            width: bitmap.width,
            height: bitmap.height,
            frameVersion: 1,
            loading: false,
          });
          startTicker();
        } else {
          framesRef.current.push(bitmap);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (intervalRef.current != null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      const frames = framesRef.current;
      framesRef.current = [];
      indexRef.current = 0;
      textureRef.current = null;
      // Free decoded bitmaps; the texture itself is kept alive by the bind
      // group in the previous render and Dawn reclaims it on GC.
      for (const b of frames) b.close?.();
    };
  }, [uri, rootState, fps, maxFrames]);

  return state;
}
