import React, { memo, useMemo } from 'react';

import { ShaderMount } from '../core/ShaderMount';
import { parseColor } from '../core/color';
import type { ShaderViewProps } from '../core/types';
import { ditherShader } from '../shaders/dither';

export type DitherShaderProps = ShaderViewProps & {
  /** Dither cell size in CSS pixels. Larger = chunkier pattern. Default 4. */
  scale?: number;
  /**
   * Strength of the dither, 0..1. 0 is invisible, 1 is hard binary dots.
   * Default 0.5.
   */
  intensity?: number;
  /** CSS color string for the dot color. Default `#000`. */
  color?: string;
};

/**
 * Animated dither pattern with transparency. Place it over an `<Image/>`,
 * `<VideoView/>`, or camera view using normal RN layout — it renders into a
 * transparent canvas; the OS compositor handles the blending.
 *
 * @example
 * ```tsx
 * <View style={{ width: 300, height: 300 }}>
 *   <Image source={...} style={StyleSheet.absoluteFill} />
 *   <DitherShader style={StyleSheet.absoluteFill} />
 * </View>
 * ```
 */
export const DitherShader = memo(function DitherShader({
  scale = 4,
  intensity = 0.5,
  color = '#000',
  speed = 1,
  ...rest
}: DitherShaderProps) {
  const uniforms = useMemo(() => {
    const [r, g, b, a] = parseColor(color);
    return {
      scale,
      intensity,
      speed,
      color: [r, g, b, a] as const,
    };
  }, [scale, intensity, speed, color]);

  return (
    <ShaderMount
      shader={ditherShader}
      uniforms={uniforms}
      speed={speed}
      {...rest}
    />
  );
});
