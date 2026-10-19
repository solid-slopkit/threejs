import { captureArtifact } from '@solidjs/diagnostics';
import { render } from '@solidjs/testing-library';
import { createSignal, Errored, flush, Loading, Show } from 'solid-js';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture, TextureLoader } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterEach, beforeEach, describe, expect, expectTypeOf, test, vi } from 'vitest';
import { stubFactory } from '../../test/harness';
import { Canvas, useCanvas, type CanvasHandle } from '../canvas';
import { T } from '../t';
import { configureLoader, loadAsset, preloadAsset, type AssetOf } from '.';

// The Asset cache is shared by the whole module, so every test loads URLs of its own.
let id = 0;
const url = (name: string) => `${name}-${++id}.bin`;

interface Model {
  readonly url: string;
  readonly scene: Group;
  readonly geometry: BoxGeometry;
  readonly material: MeshStandardMaterial;
  readonly map: Texture;
}

function model(at: string): Model {
  const geometry = new BoxGeometry();
  const map = new Texture();
  const material = new MeshStandardMaterial({ map });
  const scene = new Group();
  scene.add(new Mesh(geometry, material));
  for (const resource of [geometry, material, map]) vi.spyOn(resource, 'dispose');
  return { url: at, scene, geometry, material, map };
}

/** A loader whose loads finish when the test says so, recorded in `ModelLoader.loads`. */
class ModelLoader {
  static loads: Array<{ url: string; made?: Model; resolve: () => void; reject: (error: Error) => void }> = [];
  loadAsync(at: string): Promise<Model> {
    return new Promise((resolve, reject) => {
      const load: (typeof ModelLoader.loads)[number] = {
        url: at,
        resolve: () => resolve((load.made = model(at))),
        reject,
      };
      ModelLoader.loads.push(load);
    });
  }
}

/** Finishes every pending load of `at`, then lets Solid show the result. */
async function finish(at: string) {
  for (const load of ModelLoader.loads.filter((each) => each.url === at)) load.resolve();
  await vi.advanceTimersByTimeAsync(0);
  flush();
}

const loadsOf = (at: string) => ModelLoader.loads.filter((load) => load.url === at).length;

beforeEach(() => {
  vi.useFakeTimers();
  ModelLoader.loads = [];
});
afterEach(() => {
  vi.useRealTimers();
});

function Reader(props: { url: () => string; seen: Model[] }) {
  // oxlint-disable-next-line solid/reactivity -- loadAsset reads the accessor inside its own memo
  const asset = loadAsset(ModelLoader, props.url);
  return <span>{(props.seen.push(asset()), asset().url)}</span>;
}

describe('loadAsset', () => {
  test('suspends under Loading until the Asset has loaded', async () => {
    const at = url('ship');
    const seen: Model[] = [];
    const { container } = render(() => (
      <Loading fallback="loading">
        <Reader url={() => at} seen={seen} />
      </Loading>
    ));
    flush();
    expect(container.textContent).toBe('loading');
    await finish(at);
    expect(container.textContent).toBe(at);
  });

  test('every reader of one loader and URL shares one load and one Asset', async () => {
    const at = url('ship');
    const seen: Model[] = [];
    render(() => (
      <Loading>
        <Reader url={() => at} seen={seen} />
        <Reader url={() => at} seen={seen} />
      </Loading>
    ));
    flush();
    await finish(at);
    expect(loadsOf(at)).toBe(1);
    expect(new Set(seen).size).toBe(1);
  });

  test('another loader class is another Asset, for the same URL', async () => {
    class OtherLoader extends ModelLoader {}
    const at = url('ship');
    const assets: unknown[] = [];
    function Both() {
      const first = loadAsset(ModelLoader, () => at);
      const second = loadAsset(OtherLoader, () => at);
      return <>{(assets.push(first(), second()), null)}</>;
    }
    render(() => (
      <Loading>
        <Both />
      </Loading>
    ));
    flush();
    await finish(at);
    expect(loadsOf(at)).toBe(2);
    expect(assets[0]).not.toBe(assets[1]);
  });

  test('follows its URL, and disposes the old Asset once nothing uses it for a second', async () => {
    const first = url('first');
    const second = url('second');
    const [current, setCurrent] = createSignal(first);
    const seen: Model[] = [];
    const { container } = render(() => (
      <Loading>
        <Reader url={current} seen={seen} />
      </Loading>
    ));
    flush();
    await finish(first);
    const old = seen.at(-1)!;

    setCurrent(second);
    flush();
    // A transition: the old Asset stays on screen until the new one is ready.
    expect(container.textContent).toBe(first);
    await finish(second);
    expect(container.textContent).toBe(second);

    await vi.advanceTimersByTimeAsync(999);
    expect(old.geometry.dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(old.geometry.dispose).toHaveBeenCalledOnce();
  });

  test('keeps the old Asset while the new one loads, however long that takes', async () => {
    const first = url('first');
    const second = url('second');
    const [current, setCurrent] = createSignal(first);
    const seen: Model[] = [];
    const { container } = render(() => (
      <Loading>
        <Reader url={current} seen={seen} />
      </Loading>
    ));
    flush();
    await finish(first);
    const old = seen.at(-1)!;

    setCurrent(second);
    flush();
    await vi.advanceTimersByTimeAsync(5000);
    // Still on screen, so still alive.
    expect(container.textContent).toBe(first);
    expect(old.geometry.dispose).not.toHaveBeenCalled();

    await finish(second);
    expect(container.textContent).toBe(second);
    await vi.advanceTimersByTimeAsync(999);
    expect(old.geometry.dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(old.geometry.dispose).toHaveBeenCalledOnce();
    expect(seen.at(-1)!.geometry.dispose).not.toHaveBeenCalled();
  });

  test('a URL left before its Asset loads is let go at once; the shown one waits for its successor', async () => {
    const first = url('first');
    const second = url('second');
    const third = url('third');
    const [current, setCurrent] = createSignal(first);
    const seen: Model[] = [];
    const { container } = render(() => (
      <Loading>
        <Reader url={current} seen={seen} />
      </Loading>
    ));
    flush();
    await finish(first);
    const old = seen.at(-1)!;

    setCurrent(second);
    flush();
    setCurrent(third);
    flush();
    // The second never showed: its load finishing changes nothing, and it goes after the grace period.
    await finish(second);
    expect(container.textContent).toBe(first);
    await vi.advanceTimersByTimeAsync(1000);
    expect(ModelLoader.loads.find((load) => load.url === second)!.made!.geometry.dispose).toHaveBeenCalledOnce();
    expect(old.geometry.dispose).not.toHaveBeenCalled();

    await finish(third);
    expect(container.textContent).toBe(third);
    await vi.advanceTimersByTimeAsync(1000);
    expect(old.geometry.dispose).toHaveBeenCalledOnce();
    expect(seen.at(-1)!.geometry.dispose).not.toHaveBeenCalled();
  });

  test('a new URL that fails to load lets go of the old Asset, which Errored no longer shows', async () => {
    const first = url('first');
    const second = url('broken');
    const [current, setCurrent] = createSignal(first);
    const seen: Model[] = [];
    const { container } = render(() => (
      <Errored fallback={(error) => `failed: ${(error() as Error).message}`}>
        <Loading>
          <Reader url={current} seen={seen} />
        </Loading>
      </Errored>
    ));
    flush();
    await finish(first);
    const old = seen.at(-1)!;

    setCurrent(second);
    flush();
    ModelLoader.loads.find((load) => load.url === second)!.reject(new Error('404'));
    await vi.advanceTimersByTimeAsync(0);
    flush();
    expect(container.textContent).toBe('failed: 404');
    await vi.advanceTimersByTimeAsync(1000);
    expect(old.geometry.dispose).toHaveBeenCalledOnce();
  });

  test('disposed while the next Asset loads: lets go of both', async () => {
    const first = url('first');
    const second = url('second');
    const [current, setCurrent] = createSignal(first);
    const seen: Model[] = [];
    const { unmount } = render(() => (
      <Loading>
        <Reader url={current} seen={seen} />
      </Loading>
    ));
    flush();
    await finish(first);
    const old = seen.at(-1)!;

    setCurrent(second);
    flush();
    unmount();
    await vi.advanceTimersByTimeAsync(1000);
    expect(old.geometry.dispose).toHaveBeenCalledOnce();
    await finish(second);
    expect(ModelLoader.loads.find((load) => load.url === second)!.made!.geometry.dispose).toHaveBeenCalledOnce();
  });

  test('following a URL raises no diagnostics', async () => {
    const first = url('first');
    const second = url('second');
    const [current, setCurrent] = createSignal(first);
    const { artifact } = await captureArtifact(
      async () => {
        render(() => (
          <Loading>
            <Reader url={current} seen={[]} />
          </Loading>
        ));
        flush();
        await finish(first);
        setCurrent(second);
        flush();
        await finish(second);
      },
      { scenario: 'asset-url-change' },
    );
    // With fake timers the first load finishes at once, so its fallback flashes for 0ms.
    expect(artifact).toHaveNoDiagnostics({ allow: ['HOT_SCOPE_TIME', 'FALLBACK_FLASH'] });
  });

  test('an Asset used again within the grace period is reused, not reloaded or disposed', async () => {
    const at = url('ship');
    const [shown, setShown] = createSignal(true);
    const seen: Model[] = [];
    render(() => (
      <Loading>
        <Show when={shown()}>
          <Reader url={() => at} seen={seen} />
        </Show>
      </Loading>
    ));
    flush();
    await finish(at);
    setShown(false);
    flush();
    await vi.advanceTimersByTimeAsync(500);
    setShown(true);
    flush();
    await vi.advanceTimersByTimeAsync(2000);
    expect(loadsOf(at)).toBe(1);
    expect(seen.at(-1)!.geometry.dispose).not.toHaveBeenCalled();
  });

  test('disposal frees the geometries, materials and material textures of the scene it holds', async () => {
    const at = url('ship');
    const seen: Model[] = [];
    const { unmount } = render(() => (
      <Loading>
        <Reader url={() => at} seen={seen} />
      </Loading>
    ));
    flush();
    await finish(at);
    unmount();
    await vi.advanceTimersByTimeAsync(1000);
    const asset = seen.at(-1)!;
    expect(asset.geometry.dispose).toHaveBeenCalledOnce();
    expect(asset.material.dispose).toHaveBeenCalledOnce();
    expect(asset.map.dispose).toHaveBeenCalledOnce();
  });

  test('an Asset with its own dispose() is disposed through it', async () => {
    const texture = new Texture();
    vi.spyOn(texture, 'dispose');
    class TextureFake {
      loadAsync = () => Promise.resolve(texture);
    }
    function Use() {
      const asset = loadAsset(TextureFake, () => url('texture'));
      return <>{(asset(), null)}</>;
    }
    const { unmount } = render(() => (
      <Loading>
        <Use />
      </Loading>
    ));
    flush();
    await vi.advanceTimersByTimeAsync(0);
    unmount();
    await vi.advanceTimersByTimeAsync(1000);
    expect(texture.dispose).toHaveBeenCalledOnce();
  });

  test('released while loading: disposed when the load finishes, once the grace period is over', async () => {
    const at = url('ship');
    const { unmount } = render(() => (
      <Loading>
        <Reader url={() => at} seen={[]} />
      </Loading>
    ));
    flush();
    unmount();
    await vi.advanceTimersByTimeAsync(1000);
    await finish(at);
    expect(ModelLoader.loads[0]!.made!.geometry.dispose).toHaveBeenCalledOnce();

    // Out of the cache: a new reader loads it again.
    render(() => (
      <Loading>
        <Reader url={() => at} seen={[]} />
      </Loading>
    ));
    flush();
    expect(loadsOf(at)).toBe(2);
  });

  test('a failed load reaches Errored, and the next read tries again', async () => {
    const at = url('broken');
    const { container } = render(() => (
      <Errored fallback={(error) => `failed: ${(error() as Error).message}`}>
        <Loading>
          <Reader url={() => at} seen={[]} />
        </Loading>
      </Errored>
    ));
    flush();
    ModelLoader.loads.find((load) => load.url === at)!.reject(new Error('404'));
    await vi.advanceTimersByTimeAsync(0);
    flush();
    expect(container.textContent).toBe('failed: 404');

    render(() => (
      <Loading>
        <Reader url={() => at} seen={[]} />
      </Loading>
    ));
    flush();
    expect(loadsOf(at)).toBe(2);
  });

  test('shows in a Canvas as an Adopted Instance, which the cache, not the component, disposes', async () => {
    const at = url('ship');
    let handle!: CanvasHandle;
    function Ship() {
      handle = useCanvas();
      const ship = loadAsset(ModelLoader, () => at);
      return <T.Group object={ship().scene} position={[0, 1, 0]} />;
    }
    const { unmount } = render(() => (
      <Canvas renderer={stubFactory().factory} frameloop="never">
        <Loading>
          <Ship />
        </Loading>
      </Canvas>
    ));
    flush();
    await finish(at);
    const asset = ModelLoader.loads[0]!.made!;
    expect(asset.scene.parent).toBe(handle.scene);
    expect(asset.scene.position.y).toBe(1);

    unmount();
    expect(asset.scene.parent).toBeNull();
    expect(asset.geometry.dispose).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(asset.geometry.dispose).toHaveBeenCalledOnce();
  });

  test('types the Asset from the loader', () => {
    expectTypeOf<AssetOf<typeof GLTFLoader>>().toEqualTypeOf<GLTF>();
    expectTypeOf<AssetOf<typeof TextureLoader>>().toEqualTypeOf<Texture<HTMLImageElement>>();
  });
});

describe('preloadAsset', () => {
  test('loads before anything uses it, keeps it until it is used, then counts it like any other', async () => {
    const at = url('ship');
    const preloaded = preloadAsset(ModelLoader, at);
    await finish(at);
    const asset = await preloaded;
    await vi.advanceTimersByTimeAsync(5000);
    expect(asset.geometry.dispose).not.toHaveBeenCalled();

    const seen: Model[] = [];
    const { container, unmount } = render(() => (
      <Loading fallback="loading">
        <Reader url={() => at} seen={seen} />
      </Loading>
    ));
    flush();
    expect(container.textContent).toBe(at);
    expect(seen.at(-1)).toBe(asset);
    expect(loadsOf(at)).toBe(1);

    unmount();
    await vi.advanceTimersByTimeAsync(1000);
    expect(asset.geometry.dispose).toHaveBeenCalledOnce();
  });
});

describe('configureLoader', () => {
  test('configures the one loader of a class when it is made, and can replace disposal', async () => {
    class ConfiguredLoader extends ModelLoader {
      decoder?: string;
    }
    const configure = vi.fn((loader: ConfiguredLoader) => (loader.decoder = '/draco/'));
    const dispose = vi.fn();
    configureLoader(ConfiguredLoader, configure, { dispose });
    expect(configure).not.toHaveBeenCalled();

    const first = url('first');
    const second = url('second');
    function Both() {
      const one = loadAsset(ConfiguredLoader, () => first);
      const two = loadAsset(ConfiguredLoader, () => second);
      return <>{(one(), two(), null)}</>;
    }
    const { unmount } = render(() => (
      <Loading>
        <Both />
      </Loading>
    ));
    flush();
    expect(configure).toHaveBeenCalledOnce();
    expect(configure.mock.calls[0]![0].decoder).toBe('/draco/');

    await finish(first);
    await finish(second);
    unmount();
    await vi.advanceTimersByTimeAsync(1000);
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(dispose.mock.calls[0]![0].geometry.dispose).not.toHaveBeenCalled();
  });
});
