# Assets

An Asset is a resource loaded from a URL through a three.js loader: a model, a texture, an environment map. `loadAsset` reads one through the Asset cache, which loads each loader class and URL once, shares it with every component that asks for it, and disposes it once nothing uses it.

```tsx
import { configureLoader, loadAsset, preloadAsset } from '@solid-slopkit/threejs';
```

## Usage

```tsx
import { Loading } from 'solid-js';
import { Canvas, T, loadAsset } from '@solid-slopkit/threejs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TextureLoader } from 'three';

function Ship(props: { livery: string }) {
  const gltf = loadAsset(GLTFLoader, () => '/models/ship.glb');
  const paint = loadAsset(TextureLoader, () => `/textures/${props.livery}.jpg`);
  return (
    <T.Group object={gltf().scene} position={[0, 1, 0]}>
      <T.Mesh>
        <T.PlaneGeometry />
        <T.MeshStandardMaterial map={paint()} />
      </T.Mesh>
    </T.Group>
  );
}

<Canvas>
  <Loading fallback={null}>
    <Ship livery="red" />
  </Loading>
</Canvas>;
```

## loadAsset()

`loadAsset(Loader, url)` returns an accessor of the Asset: whatever the loader's `loadAsync(url)` resolves to, typed from it (a `GLTF` for `GLTFLoader`, a `Texture` for `TextureLoader`). `Loader` is any class constructible with no arguments that has `loadAsync(url)`.

- **Suspends:** reading the accessor before the Asset has loaded suspends under the nearest `<Loading>`, which shows its fallback until then. An Asset already in the cache is there at once.
- **Follows `url`:** `url` is a function, so a change loads the new Asset. Under a `<Loading>` that has shown its content, the old Asset stays on screen until the new one is ready.
- **Shared:** every `loadAsset` for one loader class and URL gets the same Asset, from one load. Another loader class is another Asset, even for the same URL.
- **Showing it:** show an Object3D Asset (a glTF's `scene`) through `object`, as an Adopted Instance: `<T.Group object={gltf().scene} />`. Use a texture or geometry Asset as a prop value (`map={paint()}`). A component never disposes what it adopts; the Asset cache does.
- **Once in the scene:** an `Object3D` has one parent, so adopting the same Asset in two places moves it to the second. To show it twice, clone it: `const copy = createMemo(() => gltf().scene.clone())`. A clone shares the original's geometries and materials, which the cache disposes with the original.
- **Errors:** a failed load reaches the nearest `<Errored>`. It leaves the cache, so the next read, after the boundary resets, loads it again.

## The Asset cache

- **Counting:** each `loadAsset` call uses the Asset its `url` points at, while its owner lives. When the owner is disposed it stops using it. When the `url` moves on, it keeps the old Asset, which stays on screen, until the new one has loaded or failed; a URL it leaves before that is let go at once.
- **Grace period:** an Asset nothing uses for one second is disposed and leaves the cache. One used again sooner (a `<Show>` toggling, a route coming back) is reused as it is. One released while still loading is disposed when its load finishes.
- **Disposal:** the Asset's own `dispose()` when it has one (a `Texture`). Otherwise, for every Object3D it holds (itself, or a `scene` or `scenes`, as a glTF result has), the geometries and materials in it, and the textures on those materials. `configureLoader` can replace this for a loader class.
- **Global:** the cache belongs to the page, not to a Canvas, so two Canvases share Assets.

## preloadAsset()

`preloadAsset(Loader, url)` starts loading an Asset before anything reads it, so the first read doesn't suspend, and returns a promise of the Asset. A preloaded Asset stays in the cache until it is first used; from then on it's counted like any other.

```tsx
void preloadAsset(GLTFLoader, '/models/ship.glb');
```

## configureLoader()

The Asset cache makes one loader per class, on its first load. `configureLoader(Loader, configure, options)` sets it up: `configure(loader)` runs when the loader is made, or at once if it already exists. Call it once at startup, before loading. `options.dispose(asset)` replaces the default disposal for that class's Assets.

```tsx
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

const draco = new DRACOLoader().setDecoderPath('/draco/');
const ktx2 = new KTX2Loader().setTranscoderPath('/basis/');
configureLoader(GLTFLoader, (loader) => loader.setDRACOLoader(draco).setKTX2Loader(ktx2));

// KTX2 needs to know what the renderer supports: tell it from the renderer factory.
<Canvas
  renderer={(canvas) => {
    const renderer = new WebGLRenderer({ canvas, antialias: true });
    ktx2.detectSupport(renderer);
    return renderer;
  }}
/>;
```

A glTF's KTX2 textures are read once its file has downloaded, by when the renderer exists. A `KTX2Loader` used directly throws until `detectSupport` has run, and a scene's components run before the renderer factory, so mount what loads a `.ktx2` file only once the renderer exists: `<Show when={useCanvas().renderer()}>`, from a component inside the Canvas.

Since the cache key is the loader class and the URL, one URL never loads twice with different settings.

## Types

`AssetLoader<Asset>` (a loader class), `AssetOf<L>` (what loader class `L` loads), `LoaderOptions<L>` (`{ dispose }`).
