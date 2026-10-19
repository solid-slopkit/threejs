# @solid-slopkit/threejs

three.js scenes as SolidJS 2.x components. A scene is part of the page's component tree: each Scene component creates its three.js Instance once and updates it through fine-grained bindings, with no custom renderer. Each link below is a reference for one area. Paths are relative to this file.

Task guides live next to `dist/` in the package, at `node_modules/@solid-slopkit/threejs/skills/<area>/SKILL.md`. Read the one for your task first: the rules that prevent the usual mistakes.

- `skills/scenes/SKILL.md`: describe a scene: the Canvas, `T`, props and Partial values, Attach, cameras, pointer events, controls, WebGPU and server rendering.
- `skills/animation/SKILL.md`: animate it: Frame callbacks, frame loops, Invalidating, state-driven props, Render callbacks, Frames in tests.
- `skills/assets/SKILL.md`: load models and textures: `loadAsset`, `<Loading>`, the Asset cache, cloning, preloading and loader configuration.

## Setup

`three` is a peer dependency (r171 or later), and so is `@types/three` for TypeScript:

```bash
pnpm add solid-js @solidjs/web three @types/three @solid-slopkit/threejs
```

## API

Entry points: `Canvas`, `useCanvas`, `invalidate`, `onFrame`, `onRender`, `loadAsset`, `preloadAsset`, `configureLoader`, `T` (a Scene component per three.js scene-graph class), `sceneComponent`.

Types: `CanvasProps`, `CanvasOwnProps`, `CanvasHandle`, `Frameloop`, `FrameCallback`, `RenderCallback`, `CanvasRenderer`, `CanvasSize`, `RendererFactory`, `DefaultCameraOptions`, `SceneClass`, `SceneComponent`, `InstanceProps`, `PartialValue`, `PropValue`, `SceneComponentProps`, `SceneRef`, `CameraProps`, `PointerEventProps`, `ScenePointerEvent`, `Attach`, `AttachFn`, `AssetLoader`, `AssetOf`, `LoaderOptions`.

## References

- [Canvas](canvas/canvas.md): `Canvas`, its renderer, default camera, Active camera and Frames, `invalidate()`, `useCanvas()`, Frame callbacks with `onFrame()`, and the Render callback with `onRender()`.
- [Assets](assets/assets.md): `loadAsset`, the Asset cache and its disposal, `preloadAsset`, `configureLoader`, and showing an Asset as an Adopted Instance.
- [Scene components](scene-component/scene-component.md): the `T` namespace, `sceneComponent`, Instances, their props and Partial values, Attach, Rebuild, Adopted Instances, cameras and `active`, pointer events, refs and disposal.

## Subpaths

- [Controls](controls/controls.md) (`@solid-slopkit/threejs/controls`): `<OrbitControls>`, orbiting the Active camera, Invalidating as it moves.
- [WebGPU](webgpu/webgpu.md) (`@solid-slopkit/threejs/webgpu`): `webgpuRenderer()`, the one-line WebGPU opt-in for a Canvas.
