# Canvas

The root of a scene: a `<canvas>` that fills its parent, the scene, the default camera and the renderer. Every Scene component inside a Canvas belongs to its scene.

```tsx
import { Canvas, T, invalidate, onFrame, onRender, useCanvas } from '@solid-slopkit/threejs';
```

## Usage

```tsx
<div style={{ height: '400px' }}>
  <Canvas camera={{ fov: 50, position: [0, 2, 6] }}>
    <T.Mesh>
      <T.BoxGeometry />
      <T.MeshNormalMaterial />
    </T.Mesh>
  </Canvas>
</div>
```

- **Size:** the `<canvas>` is `display: block` at 100% of its parent's width and height, so give the parent a size. A `style` you pass is merged over those three. The Canvas measures the element with a `ResizeObserver` and sizes the renderer's drawing buffer to it (times `devicePixelRatio`), without touching the element's style.
- **Renderer:** a `WebGLRenderer` with antialiasing, unless `renderer` gives a factory. The factory is called once, after the Canvas mounts, with the `<canvas>` element. It may return a promise, for a renderer that has to be initialized first; no Frame renders until it resolves. The Canvas owns what the factory returns: it disposes it, and forces its WebGL context to be lost, when its owner is disposed. A renderer that resolves after that is disposed at once.
- **Default camera:** a `PerspectiveCamera`, set from `camera`: `fov` (default 75), `near` (0.1), `far` (1000) and `position` (`[0, 0, 5]`). It follows changes to the prop; a field left out goes back to its default. Frames draw with it unless another camera is the Active camera.
- **Active camera:** the camera Frames draw with: the camera most recently made active with the `active` prop (see [Scene components](../scene-component/scene-component.md#cameras)) that still is, or the default camera when none is. Before each Frame, the Active camera is fitted to the canvas: a `PerspectiveCamera` gets the canvas's aspect ratio, and an `OrthographicCamera` keeps its `top`, `bottom` and horizontal center and gets `left` and `right` from the aspect ratio. Then its projection matrix is updated, so props such as `fov`, `zoom` or `near` show without calling `updateProjectionMatrix()`. An inactive camera is left alone.
- **Frames:** with `frameloop="demand"` (the default), a Frame renders on the animation frame after something Invalidates the Canvas, and any number of Invalidations before it render one Frame. Prop writes, Attach, detach and Rebuild Invalidate, and so do a resize, a change to `camera` and the renderer's arrival. An idle scene renders nothing. While a Frame callback is registered (see `onFrame()`), every animation frame renders one. `"always"` renders on every animation frame; `"never"` renders only through `advance()`, Frame callbacks or not, and keeps Invalidations until the mode changes.
- **Changes outside props:** after changing an Instance some other way (through a ref, in an event handler, when a texture finishes loading), call `invalidate()` on the `useCanvas()` handle, or the exported `invalidate()`, which Invalidates every Canvas in the page. Take the handle in the component body: `useCanvas()` throws in an event handler, which has no owner.
- **Context:** the Canvas is part of the component tree, so context from outside it reaches the components inside it.
- **Server rendering:** on the server, the Canvas renders its `<canvas>` and its `fallback`, never its children: no Scene component, Frame callback or Asset load runs there. When the page hydrates, the `<canvas>` is reused and the scene mounts once hydration has finished. A Canvas rendered on the client without hydration mounts its scene at once.
- **Fallback:** `fallback` is rendered after the `<canvas>`, as its sibling, until the first Frame has rendered: on the server, through hydration and while the renderer initializes. A part of the scene suspended under `<Loading>` doesn't hold it: the first Frame renders without that part, and the fallback goes. The canvas fills its parent, so lay the fallback over it yourself:

```tsx
<div style={{ position: 'relative', height: '400px' }}>
  <Canvas fallback={<img src="/ship.jpg" alt="" style={{ position: 'absolute', inset: 0 }} />}>
    <Ship />
  </Canvas>
</div>
```

## Props

Other props are passed to the `<canvas>` element. `CanvasProps` types them all (`CanvasOwnProps`, the ones below, plus the `<canvas>` attributes), and `Frameloop` is the `frameloop` union.

| Prop        | Type                              | Default                                                  | Description                                         |
| ----------- | --------------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| `renderer`  | `RendererFactory`                 | a `WebGLRenderer` with `antialias: true`                 | Creates the renderer for the `<canvas>`. Read once. |
| `camera`    | `DefaultCameraOptions`            | `{ fov: 75, near: 0.1, far: 1000, position: [0, 0, 5] }` | Settings of the default camera.                     |
| `fallback`  | `JSX.Element`                     | —                                                        | Shown after the `<canvas>` until the first Frame.   |
| `frameloop` | `'demand' \| 'always' \| 'never'` | `'demand'`                                               | When Frames render on their own.                    |
| `style`     | `JSX.CSSProperties`               | —                                                        | Merged over the fill-the-parent style.              |
| `children`  | `JSX.Element`                     | —                                                        | The scene.                                          |

`RendererFactory` is `(canvas: HTMLCanvasElement) => CanvasRenderer | Promise<CanvasRenderer>`. `CanvasRenderer` is what the Canvas calls: `render(scene, camera)`, `setSize(width, height, updateStyle)`, `setPixelRatio(ratio)` and `dispose()`. `WebGLRenderer` fits, and so does a `WebGPURenderer` once `init()` has resolved, which `webgpuRenderer()` from `@solid-slopkit/threejs/webgpu` does in one line (see [WebGPU](../webgpu/webgpu.md)). By hand:

```tsx
import { WebGPURenderer } from 'three/webgpu';

<Canvas
  renderer={async (canvas) => {
    const renderer = new WebGPURenderer({ canvas, antialias: true });
    await renderer.init();
    return renderer;
  }}
/>;
```

## useCanvas()

`useCanvas()` returns the `CanvasHandle` of the Canvas the calling component is inside, and throws outside one.

| Member         | Type                                | Description                                                                                                                                                                             |
| -------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scene`        | `Scene`                             | The scene every Instance in this Canvas belongs to.                                                                                                                                     |
| `activeCamera` | `() => Camera`                      | The Active camera: the camera made active most recently that still is, or the default camera.                                                                                           |
| `camera`       | `PerspectiveCamera`                 | The default camera.                                                                                                                                                                     |
| `renderer`     | `() => CanvasRenderer \| undefined` | The renderer, once created; `undefined` before that and on the server.                                                                                                                  |
| `size`         | `() => CanvasSize`                  | The `<canvas>` element's `{ width, height }` in CSS pixels; `0 × 0` until measured.                                                                                                     |
| `time`         | `number`                            | Frame time in seconds: the sum of every Frame's `delta`. A plain number, not a signal.                                                                                                  |
| `advance()`    | `(delta?: number) => boolean`       | Runs the Frame callbacks with `delta` (seconds, default 0), then renders one Frame, whatever `frameloop` is. Returns `false`, running and rendering nothing, while there's no renderer. |
| `invalidate()` | `() => void`                        | Asks for a Frame. Needed only after changing an Instance outside its props.                                                                                                             |

`activeCamera`, `renderer` and `size` are signals: read them in JSX, a memo or an effect to follow their changes.

## onFrame()

`onFrame(callback)` registers a Frame callback on the Canvas the calling component is inside, and throws outside one. The callback runs before every Frame until the current owner is disposed, so a component's callback goes away with the component.

```tsx
function Spinning() {
  let mesh!: Mesh;
  onFrame((canvas, delta) => {
    mesh.rotation.y += delta;
    mesh.position.y = Math.sin(canvas.time);
  });
  return (
    <T.Mesh ref={mesh}>
      <T.BoxGeometry />
      <T.MeshNormalMaterial />
    </T.Mesh>
  );
}
```

- **Arguments:** a `FrameCallback` is `(canvas: CanvasHandle, delta: number) => void`. `delta` is the seconds since the previous animation frame that rendered, and 0 on the first Frame after the loop was idle, so an animation that starts doesn't jump. `canvas.time` is the sum of every `delta` so far.
- **Order:** callbacks run in registration order, and a parent component's before its children's. One registered while a Frame runs starts with the next Frame.
- **Continuous rendering:** with `frameloop="demand"`, a Canvas renders on every animation frame while any callback is registered, and goes back to rendering on demand when the last one is disposed. `"never"` stays manual: `advance(delta)` runs the callbacks with exactly that `delta`, which steps animations deterministically in tests.
- **Changing Instances:** change them directly, through a ref, as above. That runs no reactive code, and the Frame drawn right after shows it. A signal written in a callback reaches its props only when Solid flushes, after this Frame is drawn.

## onRender()

`onRender(callback)` registers the Render callback of the Canvas the calling component is inside, and throws outside one. Until the current owner is disposed, it draws every Frame in place of `renderer.render(scene, camera)`, for example through a post-processing chain:

```tsx
import { onCleanup } from 'solid-js';
import type { WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';

function Effects() {
  const { scene, activeCamera, renderer } = useCanvas();
  let composer: EffectComposer | undefined;
  let pass: RenderPass | undefined;
  onRender((_, delta) => {
    // No Frame renders before the renderer exists, so it's there by the first call.
    if (!composer || !pass) {
      composer = new EffectComposer(renderer() as WebGLRenderer);
      pass = new RenderPass(scene, activeCamera());
      composer.addPass(pass);
    }
    pass.camera = activeCamera();
    composer.render(delta);
  });
  onCleanup(() => composer?.dispose());
  return null;
}
```

- **Arguments:** a `RenderCallback` takes the same `(canvas, delta)` as a Frame callback, and runs after every Frame callback. Draw with `canvas.activeCamera()`; it's already fitted to the canvas by then.
- **One per Canvas:** registering a second while the first is still registered throws in development. In production the first keeps drawing and the second is ignored. A Render callback that replaces another (the branches of a `Show`, say) is fine: the check runs once the old one is disposed.
- **Frames:** registering one and disposing it each Invalidate the Canvas, and once it's disposed the default draw returns. It doesn't make the Canvas render continuously: with `frameloop="demand"` it still draws only on demand. For an animated effect, register a Frame callback too, or use `frameloop="always"`.
