---
name: slopkit-threejs-scenes
description: Describe three.js scenes as SolidJS 2.x components with @solid-slopkit/threejs — the Canvas, the T namespace, props and Partial values, Attach, args and Rebuild, adopting existing objects, cameras and the Active camera, pointer events, orbit controls, WebGPU and server rendering. Use when building or changing a 3D scene, a model viewer, or anything that renders into a <canvas> with three.js in a Solid app.
---

# Describing a scene with @solid-slopkit/threejs

A scene is part of the component tree. `<Canvas>` makes the `<canvas>`, the renderer, a `Scene` and a default camera; every component inside it that wraps a three.js class (a **Scene component**: `T.Mesh`, `T.BoxGeometry`, …) creates its object once and keeps it in sync with its props. There is no custom renderer and no re-render.

The API and a reference per area are linked from `node_modules/@solid-slopkit/threejs/dist/source/llms.md`.

## Rules that prevent the usual mistakes

**Solid 2.x**

- A component function runs once. Read signals in JSX props (`position={[x(), 0, 0]}`), never into a variable at the top of the component.
- Never destructure props. Read `node_modules/solid-js/CHEATSHEET.md` before writing reactive code.

**Scenes**

- Give the Canvas's parent a size: the `<canvas>` fills it (`display: block`, 100% × 100%).
- Scene components only work inside a `<Canvas>`; outside one they throw. Ordinary components, `<Show>`, `<For>` and context work inside it.
- Children attach to their parent's object. Geometry and material go inside the mesh, a texture inside its material with `attach="map"`.
- Animate through props or Frame callbacks, never through `args`: a change to `args` constructs a new object (a **Rebuild**) and uploads it to the GPU again. `args` is only for what three.js takes in the constructor alone (a `BoxGeometry`'s size).
- After changing an object outside its props (through a ref, in an event handler), Invalidate the Canvas: by default it only renders when something asks for a Frame. Take the handle in the component body (`const canvas = useCanvas()`) and call `canvas.invalidate()` from the handler, or call the exported `invalidate()`. `useCanvas()` itself only works in the component body: an event handler has no owner, and it throws there.

## The basics

```tsx
import { createSignal } from 'solid-js';
import { Canvas, T } from '@solid-slopkit/threejs';

function Scene() {
  const [hovered, setHovered] = createSignal(false);
  return (
    <div style={{ height: '400px' }}>
      <Canvas camera={{ fov: 50, position: [0, 2, 6] }}>
        <T.AmbientLight intensity={0.4} />
        <T.DirectionalLight position={[5, 5, 5]} intensity={2} />
        <T.Mesh
          position={{ y: 1 }}
          scale={hovered() ? 1.2 : 1}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
        >
          <T.BoxGeometry args={[1, 1, 1]} />
          <T.MeshStandardMaterial color={hovered() ? 'hotpink' : 'orange'} roughness={0.4} />
        </T.Mesh>
      </Canvas>
    </div>
  );
}
```

- **`T`** has a component for each scene-graph class three.js exports: objects, cameras, lights, helpers, geometries, materials, textures and fog. For anything else (an add-on from `three/examples`, a subclass), make one at module level: `const Water = sceneComponent(WaterClass)`.
- **Props** set the object's property of the same name. Math objects are copied into, not replaced: `position={[0, 1, 0]}`, `scale={2}`, `color="hotpink"`, `rotation={[0, Math.PI, 0]}`.
- **Partial values:** an object literal sets only the fields it lists, at any depth: `position={{ y: 1 }}`, `shadow={{ mapSize: [2048, 2048], camera: { far: 50 } }}`.
- **Refs** get the object: `let mesh!: Mesh; <T.Mesh ref={mesh} />`. The ref runs before the children attach.
- **Attach:** an `Object3D` is added to its parent; a geometry goes to `geometry` and a material to `material`. Anything else needs `attach`: `<T.Texture attach="map" />`, `<T.Fog attach="fog" args={['white', 10, 50]} />`, `attach="material.1"`, or a function `(parent, self) => detach`.
- **Disposal:** an object a component constructed is disposed with its owner (`dispose={false}` keeps it). One handed in through `object` is never disposed by the component.

## Existing objects

Hand an object that already exists (a loaded model, a geometry shared between meshes) to the matching component through `object`, instead of `args`: `<T.Group object={gltf().scene} position={[0, 1, 0]} />`. Props and children apply to it; it's attached and detached but never disposed. An `Object3D` has one parent, so adopting it twice moves it: clone it to show it twice.

## Cameras

The Canvas draws with its **Active camera**: the default camera (set through the `camera` prop), or the camera most recently given `active` that still has it.

```tsx
<T.PerspectiveCamera active={view() === 'close'} position={[0, 1, 3]} fov={40} />
<T.OrthographicCamera active={view() === 'map'} args={[-1, 1, 10, -10]} position={[0, 20, 0]} rotation={[-Math.PI / 2, 0, 0]} />
```

The Active camera's aspect ratio follows the canvas (an orthographic one keeps its height and gets its width from the aspect ratio), and its projection matrix is updated before each Frame, so `fov` and `zoom` props just work. Read it with `useCanvas().activeCamera()`.

For orbiting, `import { OrbitControls } from '@solid-slopkit/threejs/controls'` and put `<OrbitControls target={[0, 1, 0]} enableDamping />` inside the Canvas. It steers the Active camera and redraws only while the camera moves.

## Pointer events

`Object3D` components take `onClick`, `onContextMenu`, `onPointerDown`, `onPointerUp`, `onPointerMove`, `onPointerOver`, `onPointerOut`, `onPointerEnter`, `onPointerLeave` and `onWheel`.

- Only objects with a handler, and what's under them, are hit-tested. An object with no handler doesn't block the pointer.
- Every hit gets the event, nearest first, each followed by its ancestors that have handlers; each object gets it once. Call `event.stopPropagation()` to keep the event from objects behind or above.
- `event.intersection.point` is where the ray hit; `event.object` is the object whose handler runs.
- For drags, call `event.setPointerCapture()` in `onPointerDown`; moves then reach the object even off it, with no `intersection` when they miss.

## Renderer, WebGPU and server rendering

- The default renderer is a `WebGLRenderer` with antialiasing. Opt into WebGPU in one line: `import { webgpuRenderer } from '@solid-slopkit/threejs/webgpu'`, then `<Canvas renderer={webgpuRenderer()}>`. Scene components and `T` work unchanged, except the materials `WebGPURenderer` can't draw (`ShaderMaterial`, `RawShaderMaterial`): use node materials there.
- On the server, a Canvas renders only its `<canvas>` and its `fallback`; the scene mounts in the browser once the page has hydrated. `fallback` shows, as a sibling of the `<canvas>`, until the first Frame has rendered; position it over the canvas yourself.
