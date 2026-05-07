import { useEffect, useState } from 'react';

import type { useTypeGPURoot } from '../core/useTypeGPURoot';

export type LoadedSourceTexture = {
  texture: GPUTexture;
  width: number;
  height: number;
};

/**
 * Loads a still image URI into a freshly-allocated `GPUTexture`. Returns
 * `null` while the URI is null, the GPU root isn't ready, or the decode is
 * still in flight. Once resolved, the same texture object is held until the
 * URI changes — `<ShaderMount/>`'s pipeline build keys off texture identity
 * so callers can pass it straight through.
 */
export function useImageSourceTexture(
  uri: string | null,
  rootState: ReturnType<typeof useTypeGPURoot>,
): LoadedSourceTexture | null {
  const [loaded, setLoaded] = useState<LoadedSourceTexture | null>(null);

  useEffect(() => {
    if (rootState.status !== 'ready' || !uri) {
      setLoaded(null);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(uri);
        // Read raw bytes rather than going through Blob → RCTBlobManager.
        // The blob path depends on `Blob._data.blobId` round-tripping through
        // the blob manager, which doesn't reliably populate for all URI
        // schemes (notably `ph://`, `file://` from ImagePicker, and `data:`).
        // Native `createImageBitmap` decodes ArrayBuffers via UIImage /
        // BitmapFactory, so PNG and JPEG both decode identically here.
        const buffer = await response.arrayBuffer();
        const bitmap = await createImageBitmap(buffer);
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
  }, [rootState, uri]);

  return loaded;
}
