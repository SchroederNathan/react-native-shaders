import { useEffect } from 'react';

type RenderLoopOpts = {
  enabled: boolean;
  /** Called every frame with the current `time` (seconds, scaled by `speed`). */
  onFrame: (time: number) => void;
  speed: number;
  /** When set, freezes time at this value and skips rAF. */
  frame?: number;
};

/**
 * Drives a per-frame `time` value via requestAnimationFrame.
 *
 * The `time` advance is wall-clock-based and scaled by `speed`, so changing
 * speed mid-flight doesn't snap the animation backwards. When `frame` is
 * provided, the loop is bypassed and `onFrame(frame)` is called once.
 */
export function useRenderLoop({
  enabled,
  onFrame,
  speed,
  frame,
}: RenderLoopOpts): void {
  useEffect(() => {
    if (!enabled) return;

    if (frame !== undefined) {
      onFrame(frame);
      return;
    }

    let raf = 0;
    let last = performance.now();
    let elapsed = 0;

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (speed !== 0) {
        elapsed += dt * speed;
        onFrame(elapsed);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, onFrame, speed, frame]);
}
