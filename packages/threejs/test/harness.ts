// The jsdom test harness. jsdom has no WebGL and lays nothing out, so tests drive a Canvas by hand: a stub renderer
// records what it is asked to do, `resize()` reports a size for the `<canvas>`, and Frames render only on
// `advance()` (anything about real drawing is tested in the browser project).
import type { Camera, Scene } from 'three';
import type { CanvasRenderer } from '../src';

export interface StubRenderer extends CanvasRenderer {
  /** The `<canvas>` the factory was called with. */
  readonly canvas: HTMLCanvasElement;
  /** Every Frame rendered, in order. */
  readonly draws: Array<{ scene: Scene; camera: Camera }>;
  /** Every `setSize(width, height, updateStyle)` call, in order. */
  readonly sizes: Array<[width: number, height: number, updateStyle: boolean | undefined]>;
  pixelRatio: number | undefined;
  disposed: boolean;
  contextLost: boolean;
}

export function stubRenderer(canvas: HTMLCanvasElement): StubRenderer {
  const stub: StubRenderer = {
    canvas,
    draws: [],
    sizes: [],
    pixelRatio: undefined,
    disposed: false,
    contextLost: false,
    render(scene, camera) {
      stub.draws.push({ scene, camera });
    },
    setSize(width, height, updateStyle) {
      stub.sizes.push([width, height, updateStyle]);
    },
    setPixelRatio(ratio) {
      stub.pixelRatio = ratio;
    },
    dispose() {
      stub.disposed = true;
    },
  };
  return Object.assign(stub, {
    forceContextLoss() {
      stub.contextLost = true;
    },
  });
}

/** A renderer factory that records each stub it makes, in `made`. */
export function stubFactory() {
  const made: StubRenderer[] = [];
  const factory = (canvas: HTMLCanvasElement) => {
    const stub = stubRenderer(canvas);
    made.push(stub);
    return stub;
  };
  return { factory, made };
}

/** A renderer factory whose stub arrives only when the test calls `resolve()`. */
export function deferredFactory() {
  let resolveStub: (() => void) | undefined;
  const made: StubRenderer[] = [];
  const factory = (canvas: HTMLCanvasElement) =>
    new Promise<StubRenderer>((resolve) => {
      resolveStub = () => {
        const stub = stubRenderer(canvas);
        made.push(stub);
        resolve(stub);
      };
    });
  return {
    factory,
    made,
    /** Resolves the pending factory call and waits for the Canvas to take the stub. */
    async resolve() {
      if (!resolveStub) throw new Error('The factory has not been called yet.');
      resolveStub();
      await Promise.resolve();
    },
  };
}

// A ResizeObserver stand-in: jsdom has none. It reports sizes only when a test calls `resize()`.
const observers = new Map<Element, Set<FakeResizeObserver>>();

class FakeResizeObserver implements ResizeObserver {
  readonly #callback: ResizeObserverCallback;
  readonly #targets = new Set<Element>();
  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
  }
  observe(target: Element) {
    this.#targets.add(target);
    if (!observers.has(target)) observers.set(target, new Set());
    observers.get(target)!.add(this);
  }
  unobserve(target: Element) {
    this.#targets.delete(target);
    observers.get(target)?.delete(this);
  }
  disconnect() {
    for (const target of this.#targets) observers.get(target)?.delete(this);
    this.#targets.clear();
  }
  notify(target: Element, width: number, height: number) {
    const entry = { target, contentRect: { width, height } } as unknown as ResizeObserverEntry;
    this.#callback([entry], this);
  }
}

export function installResizeObserver() {
  globalThis.ResizeObserver = FakeResizeObserver;
}

/** Reports a new content size for `target` to every observer watching it. Returns how many were notified. */
export function resize(target: Element, width: number, height: number): number {
  const watching = [...(observers.get(target) ?? [])];
  for (const observer of watching) observer.notify(target, width, height);
  return watching.length;
}
