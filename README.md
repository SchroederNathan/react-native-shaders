# react-native-shaders

Type-safe GPU shader components for React Native — built on
[TypeGPU](https://typegpu.com) and
[react-native-wgpu](https://github.com/wcandillon/react-native-webgpu).

```tsx
import { StyleSheet } from 'react-native';
import { DitherShader } from 'react-native-shaders';

<DitherShader
  source={require('./photo.jpg')}
  style={{ width: 320, height: 320 }}
/>
```

`<DitherShader/>` loads the image into a `GPUTexture` and runs a fragment
shader that quantises it to two colours through a Bayer (or random)
threshold matrix — a port of [paper-design/shaders](https://github.com/paper-design/shaders)'
dithering algorithm. The output is opaque; the component renders the
dithered image directly into its own WebGPU canvas.

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

Renders an image dithered to two colours.

```tsx
<DitherShader
  source={require('./photo.jpg')}     // require(...), URL string, or { uri }
  style={{ width: 320, height: 320 }}
  size={2}                            // dither cell size in CSS pixels
  type="8x8"                          // 'random' | '2x2' | '4x4' | '8x8'
  colorBack="#000"                    // colour for "0" cells
  colorFront="#fff"                   // colour for "1" / ink cells
/>
```

The image is rendered with a `cover` fit — it fills the canvas, cropping
the longer axis. The dither field is anchored to the canvas pixel grid, not
the source, so for animated sources the underlying pixels travel through a
static threshold field — the classic retro-CRT look.

| Prop              | Type                                  | Default   | Notes |
| ----------------- | ------------------------------------- | --------- | ----- |
| `source`          | `string \| { uri } \| require(...)`   | —         | Same semantics as `<Image source>`. Accepts video URIs — see below. |
| `kind`            | `'auto' \| 'image' \| 'video'`        | `'auto'`  | `auto` sniffs the URI extension. |
| `videoFps`        | `number`                              | `15`      | Video playback fps. |
| `maxVideoFrames`  | `number`                              | `120`     | Pre-decoded frame cap (memory fuse). |
| `size`            | `number`                              | `2`       | Cell size in CSS pixels. Larger = chunkier. |
| `type`            | `'random' \| '2x2' \| '4x4' \| '8x8'` | `'8x8'`   | `8x8` is smoothest tonally; `2x2` is coarsest; `random` uses a hash. |
| `colorBack`       | CSS colour string                     | `'#000'`  | |
| `colorFront`      | CSS colour string                     | `'#fff'`  | |
| `pixelRatio`      | `number`                              | `PixelRatio.get()` | Render-target DPR override. |

#### Video sources

Pass a video URI (`.mp4 .mov .m4v .webm .avi`) and `<DitherShader/>` will
play it back through the dither pipeline:

```tsx
<DitherShader
  source={videoUri}
  videoFps={15}
  maxVideoFrames={120}
  style={{ width: 360, height: 360 }}
/>
```

Install the optional peer to enable video:

```sh
npx expo install expo-video-thumbnails
```

Frames are pre-decoded at component mount and cycled in a JS-side loop, so
playback is bounded — at the defaults, the first ~8s of the video play and
then loop. Tune `videoFps` and `maxVideoFrames` for longer clips. Worst
case in-memory bitmap size is `maxVideoFrames × videoWidth × videoHeight ×
4` bytes; lower the cap or pre-downsize the video for large source files.

True streaming playback (per-frame hardware decode straight into a
`GPUTexture`) would require a native module bridging
`AVPlayerItemVideoOutput` / `MediaCodec` and is on the roadmap.

## Building your own shader

Shaders in this package are image-shaders: they sample a source `GPUTexture`
and write a colour. The shared `<ShaderMount/>` owns the `<Canvas/>`, the
TypeGPU root, the render pipeline, the uniform buffer, and the (lazy,
on-input) render loop — your shader file only describes the GPU work.

Shaders are authored as TypeGPU functions (no WGSL strings). The build
plugin `unplugin-typegpu/babel` transpiles `'use gpu'`-marked TypeScript
into WGSL at compile time. Add it to your `babel.config.js`:

```js
module.exports = (api) => {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'unplugin-typegpu/babel',
      'react-native-worklets/plugin', // must be last if you also use Reanimated
    ],
  };
};
```

Then write the shader as TypeScript:

```ts
// my-shaders/posterize.ts
import tgpu, { std } from 'typegpu';
import * as d from 'typegpu/data';
import type { ShaderModule } from 'react-native-shaders';

export const PosterizeUniforms = d.struct({
  resolution: d.vec2f, // written by <ShaderMount/> every frame
  levels: d.f32,
});

export const posterizeShader: ShaderModule<typeof PosterizeUniforms> = {
  uniforms: PosterizeUniforms,
  fragment: (layout) =>
    tgpu.fragmentFn({
      in: { uv: d.vec2f },
      out: d.vec4f,
    })((input) => {
      'use gpu';
      const u = layout.$.uniforms;
      const src = std.textureSample(
        layout.$.sourceTex,
        layout.$.sourceSampler,
        input.uv,
      );
      const stepped = std.floor(src.rgb.mul(u.levels)).div(u.levels);
      return d.vec4f(stepped, d.f32(1));
    }),
};
```

```tsx
// my-shaders/PosterizeShader.tsx
import { memo, useEffect, useMemo, useState } from 'react';
import { ShaderMount, type ShaderViewProps } from 'react-native-shaders';
import { posterizeShader } from './posterize';

type Props = ShaderViewProps & { source: string; levels?: number };

export const PosterizeShader = memo(function PosterizeShader({
  source,
  levels = 4,
  ...rest
}: Props) {
  const [texture, setTexture] = useState<GPUTexture | null>(null);
  // ...load `source` into a GPUTexture (see DitherShader.tsx for a reference).

  const uniforms = useMemo(() => ({ levels }), [levels]);

  return (
    <ShaderMount
      shader={posterizeShader}
      uniforms={uniforms}
      sourceTexture={texture}
      {...rest}
    />
  );
});
```

A few rules to know:

- The `resolution` field on your uniform struct is **always** auto-written
  by `<ShaderMount/>` — declare it, don't set it. Every other field comes
  from the `uniforms` prop, statically inferred from your `d.struct` via
  `UniformValues<U>` — renaming a field is a single TypeScript rename, not
  a silent runtime mismatch.
- The fragment function receives the bind group layout: read uniforms via
  `layout.$.uniforms.<field>`, sample the source via
  `std.textureSample(layout.$.sourceTex, layout.$.sourceSampler, uv)`. No
  `@group/@binding` strings to keep in sync.
- The vertex stage is fixed (`common.fullScreenTriangle`). Your fragment's
  `in:` should include `uv: d.vec2f`. You can also opt into builtins like
  `fragCoord: d.builtin.position`.
- `<ShaderMount/>` re-renders on input change, not on a clock. There is no
  built-in `time` uniform — if you need animation, drive a uniform from
  `requestAnimationFrame` in your component.
- `sourceTexture` is required. While it's `null`, the canvas stays blank.

## What's exported

```ts
import {
  // Built-in components
  DitherShader,
  type DitherShaderProps,
  type DitherShaderSource,
  type DitherType,

  // Authoring primitives
  ShaderMount,
  type ShaderMountProps,
  type ShaderModule,
  type ImageShaderLayout,
  type ShaderViewProps,
  type UniformValues,

  // The built-in dither module (for composing into your own components)
  ditherShader,
  DitherUniforms,
} from 'react-native-shaders';
```

## License

MIT — see [LICENSE](./LICENSE).
