// Public components — start here.
export { DitherShader } from './components/DitherShader';
export type { DitherShaderProps } from './components/DitherShader';

// Power-user surface for authoring custom shaders.
export { ShaderMount } from './core/ShaderMount';
export type { ShaderMountProps } from './core/ShaderMount';
export type {
  ShaderModule,
  ShaderViewProps,
  UniformValues,
} from './core/types';

// Re-export the built-in shader modules for users composing them with their
// own components, and the WGSL snippet helpers for new shader authors.
export { ditherShader, DitherUniforms } from './shaders/dither';
export * as wgsl from './core/wgsl-snippets';
