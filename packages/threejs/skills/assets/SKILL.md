---
name: slopkit-threejs-assets
description: Load models, textures and other files into @solid-slopkit/threejs scenes — loadAsset with <Loading> and <Errored>, the shared Asset cache and its disposal, showing a loaded glTF through the object prop, cloning to show one twice, preloadAsset, and configuring loaders (DRACO, KTX2) with configureLoader. Use when a 3D scene needs a .glb/.gltf model, a texture, an HDR environment or any file loaded through a three.js loader.
---

# Loading Assets with @solid-slopkit/threejs

An **Asset** is anything a three.js loader loads from a URL. `loadAsset(Loader, () => url)` reads it through the **Asset cache**: each loader class and URL loads once, every component that asks shares it, and it's disposed once nothing has used it for a second.

The API is in the Assets reference, linked from `node_modules/@solid-slopkit/threejs/dist/source/llms.md`.

## Rules that prevent the usual mistakes

- Put a `<Loading>` inside the Canvas, around what loads. Reading an Asset before it has loaded suspends to the nearest `<Loading>`; without one inside the Canvas, the suspension reaches past it, so the Canvas itself waits for every Asset (or the nearest `<Loading>` outside it shows instead).
- Pass the URL as a function (`() => '/ship.glb'`, `() => props.url`), so the Asset follows it.
- Never dispose an Asset yourself: the cache disposes it once nothing uses it. Components never dispose what they get through `object`.
- One Asset's scene can be in the scene graph once. To show a model twice, clone it (with `SkeletonUtils.clone` for a skinned, animated model).
- Make loaders' settings with `configureLoader`, once at startup, not per call.

## Loading and showing

```tsx
import { Errored, Loading } from 'solid-js';
import { Canvas, T, loadAsset } from '@solid-slopkit/threejs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TextureLoader } from 'three';

function Ship(props: { model: string }) {
  const gltf = loadAsset(GLTFLoader, () => `/models/${props.model}.glb`);
  return <T.Group object={gltf().scene} position={[0, 1, 0]} />;
}

function Floor() {
  const grass = loadAsset(TextureLoader, () => '/textures/grass.jpg');
  return (
    <T.Mesh rotation={[-Math.PI / 2, 0, 0]}>
      <T.PlaneGeometry args={[20, 20]} />
      <T.MeshStandardMaterial map={grass()} />
    </T.Mesh>
  );
}

<Canvas fallback={<img class="poster" src="/poster.jpg" alt="" />}>
  <Errored fallback={(error) => null}>
    <Loading fallback={null}>
      <Ship model="clipper" />
      <Floor />
    </Loading>
  </Errored>
</Canvas>;
```

- The accessor is typed from the loader: `gltf()` is a `GLTF` (`scene`, `animations`, …), `grass()` a `Texture`.
- Show an Object3D Asset with the `object` prop of the matching component (`T.Group`, `T.Mesh`, `T.Object3D`), and use texture and geometry Assets as prop values.
- When the URL changes, the old Asset stays on screen, and cached, until the new one has loaded (or failed).
- A failed load reaches the nearest `<Errored>`; the next read loads again.
- The Canvas's `fallback` shows until the first Frame, which renders as soon as the renderer is ready, with whatever has loaded: use it for a poster while the renderer starts, not as a loading indicator for Assets. Show Asset progress in the DOM next to the Canvas.

## Showing one Asset twice

```tsx
import { For } from 'solid-js';

function Fleet() {
  const gltf = loadAsset(GLTFLoader, () => '/models/ship.glb');
  return <For each={[0, 3, 6]}>{(x) => <T.Group object={gltf().scene.clone()} position={[x, 0, 0]} />}</For>;
}
```

A clone shares the original's geometries and materials, which the cache disposes with the Asset. `Object3D.clone()` doesn't rebind a skinned mesh to its cloned bones: for an animated character, use `clone` from `three/examples/jsm/utils/SkeletonUtils.js`. Clone materials too (`mesh.material = mesh.material.clone()`) before changing one copy's color.

## Preloading and configuring

```tsx
import { configureLoader, preloadAsset } from '@solid-slopkit/threejs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const draco = new DRACOLoader().setDecoderPath('/draco/');
configureLoader(GLTFLoader, (loader) => loader.setDRACOLoader(draco));

void preloadAsset(GLTFLoader, '/models/ship.glb');
```

- `configureLoader(Loader, configure, { dispose })` sets up the one loader the cache makes for that class; `dispose` replaces the default disposal of its Assets.
- KTX2 needs to know what the renderer supports, and its loader throws until it does: call `ktx2.detectSupport(renderer)` inside the Canvas's `renderer` factory, where the renderer is made, A glTF's KTX2 textures load after its file has downloaded, by when that has run. A `.ktx2` file loaded directly through `KTX2Loader` must wait for the renderer, since a scene's components run before the factory: mount what loads it inside `<Show when={canvas.renderer()}>`, with `canvas` from `useCanvas()`.
- `preloadAsset` starts a load before anything reads it (on hover over a link, at startup), so the first read doesn't suspend. A preloaded Asset stays cached until it's first used.
