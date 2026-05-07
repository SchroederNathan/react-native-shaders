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
        const buffer = await fetchArrayBuffer(uri);
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
          console.error(
            '[react-native-shaders] image load failed for',
            uri,
            err,
          );
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

// Use XHR rather than fetch(): RN's fetch doesn't reliably handle every URI
// scheme we get here (notably `file://` on Android, `ph://`, and ImagePicker
// temp paths). XHR with responseType='arraybuffer' goes through a native
// path that does, and skips the Blob/BlobManager round-trip entirely.
function fetchArrayBuffer(uri: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', uri, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      // status === 0 is the normal "success" for file://, content://, and
      // bundled-asset URIs — they have no HTTP layer.
      if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
        const response = xhr.response;
        if (response instanceof ArrayBuffer) {
          resolve(response);
        } else {
          reject(new Error('XHR returned non-ArrayBuffer response'));
        }
      } else {
        reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText || 'failed'}`));
      }
    };
    xhr.onerror = () =>
      reject(new Error(`network error fetching ${uri}`));
    xhr.send();
  });
}
