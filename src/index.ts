// Public components — start here.
export { DitherShader } from './components/DitherShader';
export type {
  DitherShaderProps,
  DitherShaderSource,
  DitherType,
} from './components/DitherShader';

// Power-user surface for authoring custom shaders.
export { ShaderMount } from './core/ShaderMount';
export type { ShaderMountProps } from './core/ShaderMount';
export type {
  ImageShaderLayout,
  ShaderModule,
  ShaderViewProps,
  UniformValues,
} from './core/types';

// Re-export the built-in shader modules for users composing them with their
// own components.
export { ditherShader, DitherUniforms } from './shaders/dither';
