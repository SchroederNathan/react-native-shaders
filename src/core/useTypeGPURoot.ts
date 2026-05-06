import { useEffect, useState } from 'react';
import tgpu, { type TgpuRoot } from 'typegpu';

type RootState =
  | { status: 'pending' }
  | { status: 'ready'; root: TgpuRoot; device: GPUDevice }
  | { status: 'error'; error: Error };

// Process-wide singleton. Every <ShaderMount/> (and any consumer that wants
// to allocate textures, e.g. the image-loading layer in <DitherShader/>)
// must share one GPUDevice — Dawn rejects cross-device resource use, so
// creating a fresh device per component would prevent us from passing an
// image texture loaded in one component into a pipeline owned by another.
let sharedPromise: Promise<{ root: TgpuRoot; device: GPUDevice }> | null = null;

async function ensureRoot() {
  if (!sharedPromise) {
    sharedPromise = (async () => {
      if (!('gpu' in navigator) || navigator.gpu == null) {
        throw new Error(
          'WebGPU is not available. Install react-native-wgpu and rebuild.',
        );
      }
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error('No WebGPU adapter available.');
      const device = await adapter.requestDevice();
      const root = tgpu.initFromDevice({ device });
      return { root, device };
    })();
    // If init fails we want subsequent mounts to retry, not stick on the
    // rejected promise.
    sharedPromise.catch(() => {
      sharedPromise = null;
    });
  }
  return sharedPromise;
}

/**
 * Returns the shared TypeGPU root. Safe to call from any component — all
 * callers receive the same `{ root, device }` once initialization completes.
 */
export function useTypeGPURoot(): RootState {
  const [state, setState] = useState<RootState>({ status: 'pending' });

  useEffect(() => {
    let cancelled = false;
    ensureRoot()
      .then(({ root, device }) => {
        if (cancelled) return;
        setState({ status: 'ready', root, device });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
