# Controls

Camera controls for a Canvas, at the subpath `@solid-slopkit/threejs/controls`, so an app without them never loads three's controls.

```tsx
import { OrbitControls } from '@solid-slopkit/threejs/controls';
```

## OrbitControls

`<OrbitControls>` goes inside a Canvas, anywhere in the scene. It orbits the Active camera around a target: drag to orbit, turn the wheel to zoom, drag with the right button (or two fingers) to pan.

```tsx
<Canvas camera={{ position: [0, 2, 6] }}>
  <OrbitControls target={[0, 1, 0]} enableDamping minDistance={2} maxDistance={20} onEnd={() => save()} />
  <Ship />
</Canvas>
```

- **Bound to the Canvas:** the controls listen on the Canvas's `<canvas>` and steer its Active camera. When another camera becomes active, the same controls move to it, keeping their target and settings.
- **Props:** every property of three's `OrbitControls` is a prop, with the same copy rules as Instance props: `target={[0, 1, 0]}` copies into the target `Vector3`, and `enableDamping`, `dampingFactor`, `minDistance`, `maxPolarAngle`, `autoRotate`, `enablePan`, `mouseButtons` and the rest are assigned. Each prop is its own binding, and a change takes effect at once (the controls update) and renders a Frame. Which props there are is read once.
- **Frames:** every camera move Invalidates the Canvas, so a scene with `frameloop="demand"` redraws while you drag and goes idle when you stop. With `enableDamping`, the camera keeps easing after a gesture ends: the controls update before every Frame until it comes to rest, then the Canvas is back on demand. `autoRotate` renders every Frame for as long as it's on.
- **Events:** `onChange` runs when the camera moves, `onStart` and `onEnd` around a gesture (with damping, the camera may still be easing after `onEnd`). Each is read when it runs, so it can change.
- **Ref:** `ref` receives three's `OrbitControls` once set up, for its methods (`saveState()`, `reset()`, `listenToKeyEvents(window)`) and its live state. After calling a method that moves the camera, the controls' own `change` event Invalidates.
- **Disposal:** the controls are disposed, and stop listening, when their owner is disposed. Inside a `<Show>`, they come and go with it.

`OrbitControlsProps` types the props.
