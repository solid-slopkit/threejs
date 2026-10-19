# WebGPU

`webgpuRenderer()` makes a Canvas render with three.js's `WebGPURenderer`. It's a subpath of its own, so an app that renders with WebGL never loads `three/webgpu`.

```tsx
import { Canvas } from '@solid-slopkit/threejs';
import { webgpuRenderer } from '@solid-slopkit/threejs/webgpu';

<Canvas renderer={webgpuRenderer({ antialias: true })}>…</Canvas>;
```

## webgpuRenderer()

`webgpuRenderer(parameters)` returns a `RendererFactory` for the Canvas's `renderer` prop. It makes a `WebGPURenderer` for the `<canvas>` with `parameters` (every `WebGPURendererParameters` field but `canvas`) and resolves once the renderer's `init()` has, so no Frame renders before the GPU device is ready.

- **Fallback:** where the browser offers no WebGPU adapter, the `WebGPURenderer` uses its WebGL 2 backend on its own. Pass `forceWebGL: true` to always use it, for example to compare the two.
- **Scenes:** Scene components and `T` work unchanged: `three` and `three/webgpu` share their core classes. The exception is what `WebGPURenderer` can't draw: `ShaderMaterial` and `RawShaderMaterial` need node materials instead. Node materials from `three/webgpu` (`MeshStandardNodeMaterial`, …) get Scene components through `sceneComponent`.
- **Renderer access:** `useCanvas().renderer()` is the `WebGPURenderer` once it has initialized, `undefined` before.
- **Disposal:** the Canvas disposes the renderer with its owner, as it does any renderer; one that finishes initializing after the Canvas is gone is disposed at once.
