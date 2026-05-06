import { useEffect, useState } from 'react';
import tgpu, { type TgpuRoot } from 'typegpu';

type RootState =
  | { status: 'pending' }
  | { status: 'ready'; root: TgpuRoot; device: GPUDevice }
  | { status: 'error'; error: Error };

/**
 * Acquires a WebGPU device and wraps it in a TypeGPU root.
 *
 * `<ShaderMount/>` calls this once per mount. The device-request side effect
 * is one-shot: subsequent renders return the already-resolved root. On unmount
 * we destroy the root so its buffers/pipelines free their GPU memory.
 */
export function useTypeGPURoot(): RootState {
  const [state, setState] = useState<RootState>({ status: 'pending' });

  useEffect(() => {
    let cancelled = false;
    let createdRoot: TgpuRoot | null = null;

    (async () => {
      try {
        if (!('gpu' in navigator) || navigator.gpu == null) {
          throw new Error(
            'WebGPU is not available. Install react-native-wgpu and rebuild.',
          );
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error('No WebGPU adapter available.');

        const device = await adapter.requestDevice();
        const root = tgpu.initFromDevice({ device });
        createdRoot = root;

        if (cancelled) {
          root.destroy();
          return;
        }
        setState({ status: 'ready', root, device });
      } catch (error) {
        if (cancelled) return;
        setState({
          status: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    })();

    return () => {
      cancelled = true;
      createdRoot?.destroy();
    };
  }, []);

  return state;
}
