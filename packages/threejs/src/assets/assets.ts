import { createMemo, onCleanup, type Accessor } from 'solid-js';
import type { BufferGeometry, Material, Object3D, Texture } from 'three';

/** A three.js loader class: constructible with no arguments, with `loadAsync(url)`. */
export type AssetLoader<Asset = unknown> = new () => { loadAsync(url: string): Promise<Asset> };

/** What a loader class loads: the value its `loadAsync` resolves to. */
export type AssetOf<L extends AssetLoader> = Awaited<ReturnType<InstanceType<L>['loadAsync']>>;

export interface LoaderOptions<L extends AssetLoader> {
  /** Frees an Asset of this loader once the Asset cache lets it go, in place of the default disposal. */
  dispose?: (asset: AssetOf<L>) => void;
}

/** How long an Asset stays cached once nothing uses it, in milliseconds. */
const GRACE_PERIOD = 1000;

interface Entry {
  readonly promise: Promise<unknown>;
  value?: unknown;
  loaded: boolean;
  // Reactive owners using it.
  refs: number;
  // Preloaded and not used yet: kept whatever the grace period.
  waiting: boolean;
  // Out of the cache: disposed once loaded, if it wasn't yet.
  evicted: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

interface LoaderState {
  loader?: InstanceType<AssetLoader>;
  configure?: (loader: any) => void;
  dispose?: (asset: any) => void;
  readonly entries: Map<string, Entry>;
}

const loaders = new Map<AssetLoader, LoaderState>();

function stateOf(Loader: AssetLoader): LoaderState {
  let state = loaders.get(Loader);
  if (!state) loaders.set(Loader, (state = { entries: new Map() }));
  return state;
}

// The one loader of a class, made and configured on first use.
function loaderOf(Loader: AssetLoader) {
  const state = stateOf(Loader);
  if (!state.loader) {
    state.loader = new Loader();
    state.configure?.(state.loader);
  }
  return state.loader;
}

function entryOf(Loader: AssetLoader, url: string, waiting: boolean): Entry {
  const state = stateOf(Loader);
  const cached = state.entries.get(url);
  if (cached) return cached;
  const entry: Entry = {
    promise: loaderOf(Loader)
      .loadAsync(url)
      .then(
        (value) => {
          entry.value = value;
          entry.loaded = true;
          if (entry.evicted) disposeOf(Loader, value);
          return value;
        },
        (error: unknown) => {
          // A failed load leaves the cache, so the next read tries again.
          if (state.entries.get(url) === entry) state.entries.delete(url);
          throw error;
        },
      ),
    loaded: false,
    refs: 0,
    waiting,
    evicted: false,
  };
  // Nothing may be waiting on a preload's promise yet.
  entry.promise.catch(() => {});
  state.entries.set(url, entry);
  return entry;
}

function acquire(Loader: AssetLoader, url: string): Entry {
  const entry = entryOf(Loader, url, false);
  entry.refs++;
  entry.waiting = false;
  clearTimeout(entry.timer);
  entry.timer = undefined;
  return entry;
}

function release(Loader: AssetLoader, url: string, entry: Entry) {
  entry.refs--;
  if (entry.refs > 0) return;
  entry.timer = setTimeout(() => {
    entry.timer = undefined;
    if (entry.refs > 0 || entry.waiting) return;
    const { entries } = stateOf(Loader);
    if (entries.get(url) === entry) entries.delete(url);
    entry.evicted = true;
    if (entry.loaded) disposeOf(Loader, entry.value);
  }, GRACE_PERIOD);
}

function disposeOf(Loader: AssetLoader, asset: unknown) {
  const custom = stateOf(Loader).dispose;
  if (custom) custom(asset);
  else disposeAsset(asset);
}

// The default disposal: the Asset's own `dispose()`, or else the geometries, materials and material textures of
// every Object3D it holds (itself, or a `scene` or `scenes`, as a glTF result has).
function disposeAsset(asset: unknown) {
  if (asset === null || typeof asset !== 'object') return;
  const disposable = asset as { dispose?: () => void };
  if (typeof disposable.dispose === 'function') return disposable.dispose();

  const holder = asset as { scene?: unknown; scenes?: unknown };
  const roots = [asset, holder.scene, ...(Array.isArray(holder.scenes) ? holder.scenes : [])].filter(
    (root): root is Object3D => (root as Partial<Object3D> | undefined)?.isObject3D === true,
  );
  const freed = new Set<{ dispose(): void }>();
  for (const root of roots) {
    root.traverse((object) => {
      const { geometry, material } = object as { geometry?: BufferGeometry; material?: Material | Material[] };
      if (geometry?.isBufferGeometry) freed.add(geometry);
      for (const each of Array.isArray(material) ? material : material ? [material] : []) {
        for (const value of Object.values(each)) if ((value as Partial<Texture> | null)?.isTexture) freed.add(value);
        freed.add(each);
      }
    });
  }
  for (const resource of freed) resource.dispose();
}

/**
 * Configures the loader of a class: `configure` runs on the one loader the Asset cache makes for it (now, if it
 * already exists), and `dispose` replaces the default disposal of its Assets. Call it once, before loading.
 */
export function configureLoader<L extends AssetLoader>(
  Loader: L,
  configure?: (loader: InstanceType<L>) => void,
  options: LoaderOptions<L> = {},
): void {
  const state = stateOf(Loader);
  state.configure = configure;
  state.dispose = options.dispose;
  if (state.loader) configure?.(state.loader as InstanceType<L>);
}

/**
 * Loads an Asset through the Asset cache: an accessor that suspends under `<Loading>` until it has loaded, and
 * follows `url`. The calling owner uses the Asset until it is disposed or `url` changes; an Asset nothing uses for a
 * second is disposed. A failed load reaches the nearest `<Errored>`, and the next read tries again.
 */
export function loadAsset<L extends AssetLoader>(Loader: L, url: () => string): Accessor<AssetOf<L>> {
  return createMemo(
    () => {
      const current = url();
      const entry = acquire(Loader, current);
      onCleanup(() => release(Loader, current, entry));
      return (entry.loaded ? entry.value : entry.promise) as AssetOf<L> | Promise<AssetOf<L>>;
    },
    { name: `loadAsset.${Loader.name}` },
  );
}

/**
 * Starts loading an Asset before anything uses it, so `loadAsset` finds it in the Asset cache. A preloaded Asset stays
 * cached until it is first used, and from then on like any other. Resolves to the Asset.
 */
export function preloadAsset<L extends AssetLoader>(Loader: L, url: string): Promise<AssetOf<L>> {
  const entry = entryOf(Loader, url, true);
  if (entry.refs === 0) entry.waiting = true;
  return entry.promise as Promise<AssetOf<L>>;
}
