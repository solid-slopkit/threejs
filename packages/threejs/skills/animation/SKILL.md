---
name: slopkit-threejs-animation
description: Animate @solid-slopkit/threejs scenes — Frame callbacks with onFrame, frame loops (demand, always, never), Invalidating, Partial values and signals for changes driven by state, Render callbacks with onRender for post-processing, and deterministic Frames in tests with advance(delta). Use when something in a 3D scene should move, spin, follow the pointer, ease, or when a scene renders too often or not at all.
---

# Animating a scene with @solid-slopkit/threejs

A Canvas renders a **Frame** only when something asks for one (it **Invalidates**): a prop write, an object attached or removed, a resize. An idle scene renders nothing. Animation either asks for Frames continuously (a Frame callback) or changes props from state, which asks for one Frame per change.

The API and a reference per area are linked from `node_modules/@solid-slopkit/threejs/dist/source/llms.md`; Frames, `onFrame` and `onRender` are in the Canvas reference.

## Pick the tool

| You want                                                   | Use                                                                               |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Something to move every frame (spin, bob, follow a path)   | `onFrame` mutating the object through a ref                                       |
| An object to change when state changes (selected, hovered) | A signal in its props: `scale={selected() ? 1.2 : 1}`                             |
| One field of a nested object to follow state               | A Partial value: `position={{ y: height() }}`, `material={{ opacity: fade() }}`   |
| A change made outside props to show                        | `canvas.invalidate()` on the `useCanvas()` handle, or the exported `invalidate()` |
| A different draw (post-processing)                         | `onRender`                                                                        |
| Every animation frame rendered, whatever happens           | `<Canvas frameloop="always">`                                                     |
| Frames rendered only by your code                          | `<Canvas frameloop="never">` and `useCanvas().advance(delta)`                     |

## Frame callbacks

```tsx
import { onFrame, T } from '@solid-slopkit/threejs';
import type { Mesh } from 'three';

function Spinner() {
  let mesh!: Mesh;
  onFrame((canvas, delta) => {
    mesh.rotation.y += delta; // radians per second
    mesh.position.y = Math.sin(canvas.time) * 0.5;
  });
  return (
    <T.Mesh ref={mesh}>
      <T.BoxGeometry />
      <T.MeshNormalMaterial />
    </T.Mesh>
  );
}
```

- `onFrame` must be called in a component inside a Canvas. The callback runs before every Frame until the component's owner is disposed, in registration order (a parent's before its children's).
- `delta` is in seconds since the previous Frame, 0 on the first one after the loop was idle. Multiply speeds by it, so motion doesn't depend on the frame rate. `canvas.time` is the sum of the deltas.
- While any Frame callback is registered, a Canvas with the default `frameloop="demand"` renders every animation frame; it goes back to on-demand when the last one is disposed. Put the callback in a component inside a `<Show>` to animate only while it's shown.
- **Mutate objects directly in a Frame callback; don't write signals there.** A direct mutation runs no reactive code and shows in the Frame drawn right after. A signal written in a callback reaches its props only when Solid flushes, after that Frame, and costs a reactive update every frame.
- Reuse objects: allocate vectors once outside the callback (`const target = new Vector3()`), not on every frame.

## State-driven changes

Signals in props render one Frame per change and nothing in between, which is the right default for anything that changes on events rather than continuously.

```tsx
<T.Mesh position={{ y: lifted() ? 1 : 0 }} material={{ opacity: visible() ? 1 : 0.3, transparent: true }}>
  <T.BoxGeometry />
  <T.MeshStandardMaterial />
</T.Mesh>
```

A Partial value (an object literal for an object property) writes only the fields it lists, so `position={{ y: … }}` leaves `x` and `z` to other code. To ease between values, run a Frame callback in a component that exists only while easing, or write the eased value from the callback onto the object.

## Render callbacks

`onRender((canvas, delta) => …)` replaces the Canvas's `renderer.render(scene, camera)` for every Frame, after the Frame callbacks. Use it to draw through a post-processing chain, with `canvas.activeCamera()` as the camera. A Canvas has at most one; a second one is an error in development. It doesn't render continuously by itself: pair it with a Frame callback or `frameloop="always"` for an animated effect.

## Tests

Render with `frameloop="never"` and, in jsdom (which has no WebGL), a stub renderer: `renderer={() => ({ render() {}, setSize() {}, setPixelRatio() {}, dispose() {} })}`, or run the test in a real browser. Get the handle with `useCanvas()` from a small probe component inside the Canvas, and step time yourself: `handle.advance(0.5)` runs the Frame callbacks with `delta` 0.5 and renders one Frame. It returns `false` and does nothing while the renderer isn't there yet.
