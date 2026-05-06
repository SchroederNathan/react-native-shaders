# react-native-shaders

Animated, type-safe GPU shader components for React Native — built on
[TypeGPU](https://typegpu.com) and
[react-native-wgpu](https://github.com/wcandillon/react-native-webgpu).

```tsx
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { DitherShader } from 'react-native-shaders';

<View style={{ width: 300, height: 300 }}>
  <Image source={require('./photo.jpg')} style={StyleSheet.absoluteFill} />
  <DitherShader style={StyleSheet.absoluteFill} />
</View>
```

The shader renders into a transparent WebGPU canvas; the OS compositor blends
it over whatever is beneath. The same `<DitherShader/>` works over an
`<Image/>`, an `<expo-video>` `<VideoView/>`, or a
`<react-native-vision-camera>` `<Camera/>` — no source prop, no
post-processing, no view capture.

## Install

```sh
npx expo install react-native-shaders
```

This pulls in the WebGPU peers (`react-native-wgpu`, `typegpu`) and wires up
the Expo config plugin. For bare React Native projects, install the same
peers manually and run `npx expo prebuild`.

| Package manager | Command                              |
| --------------- | ------------------------------------ |
| Expo            | `npx expo install react-native-shaders` |
| npm             | `npm i react-native-shaders react-native-wgpu typegpu` |
| Bun             | `bun add react-native-shaders react-native-wgpu typegpu` |
| Yarn            | `yarn add react-native-shaders react-native-wgpu typegpu` |
| pnpm            | `pnpm add react-native-shaders react-native-wgpu typegpu` |

Requires React Native 0.81+ with the new architecture, and a WebGPU-capable
device (most iOS 14+, Android with Vulkan/Metal-class GPUs, and any browser
that supports WebGPU on web).

## Components

### `<DitherShader/>`

Animated dither overlay.

```tsx
<DitherShader
  style={StyleSheet.absoluteFill}
  scale={4}        // dither cell size in CSS pixels
  intensity={0.5}  // 0 = invisible, 1 = hard binary dots
  speed={1}        // animation speed multiplier; 0 freezes the pattern
  color="#000"     // dot color (any CSS color string)
/>
```

## Building your own shader

Shaders are one short file. The shared `<ShaderMount/>` handles the
`<Canvas/>`, the TypeGPU root, the render pipeline, the uniform buffer, and
the frame loop — your shader file only describes the GPU work.

```ts
// my-shaders/stripes.ts
import * as d from 'typegpu/data';
import { wgsl, type ShaderModule } from 'react-native-shaders';

export const StripesUniforms = d.struct({
  time:       d.f32,
  resolution: d.vec2f,
  spacing:    d.f32,
  color:      d.vec4f,
});

export const stripesShader: ShaderModule<typeof StripesUniforms> = {
  uniforms: StripesUniforms,
  code: `
    ${wgsl.FULLSCREEN_TRIANGLE_VS}

    struct Uniforms {
      time: f32, resolution: vec2f, spacing: f32, color: vec4f,
    };
    @group(0) @binding(0) var<uniform> u: Uniforms;

    @fragment
    fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
      let band = step(0.5, fract((uv.x * u.resolution.x + u.time * 40.0) / u.spacing));
      let a = band * u.color.a;
      return vec4f(u.color.rgb * a, a);
    }
  `,
};
```

```tsx
// my-shaders/StripesShader.tsx
import { memo, useMemo } from 'react';
import { ShaderMount, type ShaderViewProps } from 'react-native-shaders';
import { stripesShader } from './stripes';

type Props = ShaderViewProps & { spacing?: number; color?: string };

export const StripesShader = memo(function StripesShader({
  spacing = 24,
  color = '#fff',
  ...rest
}: Props) {
  const uniforms = useMemo(() => ({
    spacing,
    color: hexToRgba(color),
  }), [spacing, color]);
  return <ShaderMount shader={stripesShader} uniforms={uniforms} {...rest} />;
});
```

`time` and `resolution` are written for you every frame. Anything else in
your `d.struct` you set yourself via `uniforms`.

## What's exported

```ts
import {
  // Built-in components
  DitherShader,

  // Authoring primitives
  ShaderMount,
  type ShaderModule,
  type ShaderViewProps,

  // The built-in dither module (for composing into your own components)
  ditherShader,
  DitherUniforms,

  // Reusable WGSL snippets (fullscreen triangle vs, bayer matrices, noise)
  wgsl,
} from 'react-native-shaders';
```

## License

MIT — see [LICENSE](./LICENSE).
