import {
  createContext,
  createEffect,
  createSignal,
  DEV,
  isHydrating,
  omit,
  onCleanup,
  onSettled,
  Show,
  untrack,
  useContext,
} from 'solid-js';
import { isServer, type JSX } from '@solidjs/web';
import { PerspectiveCamera, Scene, WebGLRenderer, type Camera, type Object3D, type OrthographicCamera } from 'three';
import { ParentContext } from '../scene-component/parent';
import { createFrameLoop, type Frameloop } from './frame-loop';
import { createPointerEvents, type HandlerLookup, type InteractiveClaim } from './pointer-events';

/** What a Canvas needs from a renderer. `WebGLRenderer` and an initialized `WebGPURenderer` both fit. */
export interface CanvasRenderer {
  render(scene: Scene, camera: Camera): unknown;
  setSize(width: number, height: number, updateStyle?: boolean): unknown;
  setPixelRatio(ratio: number): unknown;
  dispose(): unknown;
}

/**
 * Creates the Canvas's renderer for its `<canvas>` element. It may return a promise (a `WebGPURenderer` has to be
 * initialized first); no Frame renders before it resolves.
 */
export type RendererFactory = (canvas: HTMLCanvasElement) => CanvasRenderer | Promise<CanvasRenderer>;

/** Settings of the default camera, a `PerspectiveCamera`. */
export interface DefaultCameraOptions {
  /** Vertical field of view, in degrees. Defaults to 75. */
  fov?: number;
  /** Near clipping plane. Defaults to 0.1. */
  near?: number;
  /** Far clipping plane. Defaults to 1000. */
  far?: number;
  /** Position in the scene. Defaults to `[0, 0, 5]`. */
  position?: readonly [x: number, y: number, z: number];
}

/** The size of a Canvas's `<canvas>` element, in CSS pixels. */
export interface CanvasSize {
  width: number;
  height: number;
}

/** A Canvas, as the components inside it see it. */
export interface CanvasHandle {
  /** The scene every Instance in this Canvas belongs to. */
  readonly scene: Scene;
  /** The default camera. */
  readonly camera: PerspectiveCamera;
  /** The Active camera: the camera most recently made active that still is, or the default camera. */
  readonly activeCamera: () => Camera;
  /** The renderer, once the factory has returned or resolved; `undefined` before that and on the server. */
  readonly renderer: () => CanvasRenderer | undefined;
  /** The `<canvas>` element's size, kept up to date as it resizes. `0 × 0` until it has been measured. */
  readonly size: () => CanvasSize;
  /**
   * Frame time, in seconds: the sum of every Frame's `delta` so far. A plain number, not a signal: read it in a Frame
   * callback.
   */
  readonly time: number;
  /**
   * Renders one Frame now, whatever `frameloop` is, after running the Frame callbacks with `delta` (seconds, default
   * 0). Returns `false`, and runs and renders nothing, while there is no renderer yet.
   */
  advance(delta?: number): boolean;
  /**
   * Asks for a Frame. Prop writes, Attach, detach and Rebuild do it on their own; call it after changing an Instance
   * some other way (through a ref, or when a texture finishes loading).
   */
  invalidate(): void;
}

export interface CanvasOwnProps {
  /** Creates the renderer. Read once. Defaults to a `WebGLRenderer` with antialiasing. */
  renderer?: RendererFactory;
  /** Settings of the default camera. */
  camera?: DefaultCameraOptions;
  /**
   * When Frames render on their own: `"demand"` (the default) on the animation frame after an Invalidation, and on
   * every one while a Frame callback is registered; `"always"` on every animation frame; `"never"` only through
   * `advance()`.
   */
  frameloop?: Frameloop;
  /**
   * Shown after the `<canvas>`, as its sibling, until the first Frame has rendered: on the server, during hydration
   * and while the renderer initializes. Lay it over the canvas with your own CSS.
   */
  fallback?: JSX.Element;
  /** The scene: Scene components, and any component that renders them. Never rendered on the server. */
  children?: JSX.Element;
}

export type CanvasProps = Omit<JSX.CanvasHTMLAttributes<HTMLCanvasElement>, keyof CanvasOwnProps | 'ref' | 'style'> &
  CanvasOwnProps & { style?: JSX.CSSProperties };

/**
 * Runs before a Frame renders, with the Canvas and the seconds since the previous Frame (0 on the first one after
 * the loop was idle).
 */
export type FrameCallback = (canvas: CanvasHandle, delta: number) => void;

/**
 * Draws a Frame in place of the Canvas's `renderer.render(scene, camera)`, after the Frame callbacks, with the same
 * arguments.
 */
export type RenderCallback = FrameCallback;

const CanvasContext = createContext<CanvasHandle>();

// How `onFrame` and `onRender` register their callbacks on a Canvas. Each returns the unregister.
interface Registry {
  frame(callback: FrameCallback): () => void;
  render(callback: RenderCallback): () => void;
  /** How many Render callbacks are registered. */
  renders(): number;
}
const registries = new WeakMap<CanvasHandle, Registry>();

/** A camera's claim on being a Canvas's Active camera. */
export interface CameraClaim {
  /** Puts another camera in this claim's place, keeping its position in the stack (a Rebuild). */
  swap(camera: Camera): void;
  release(): void;
}

// The Active camera stack of each Canvas, for camera Scene components.
const cameraStacks = new WeakMap<CanvasHandle, (camera: Camera) => CameraClaim>();

// The Interactive Instances of each Canvas, for Scene components of `Object3D`s with pointer event handlers.
const interactives = new WeakMap<CanvasHandle, (instance: Object3D, handlers: HandlerLookup) => InteractiveClaim>();

/** Makes `instance` an Interactive Instance of `canvas` until the claim is released. Internal to the package. */
export function claimInteractive(canvas: CanvasHandle, instance: Object3D, handlers: HandlerLookup): InteractiveClaim {
  return interactives.get(canvas)!(instance, handlers);
}

// Each Canvas's `<canvas>` element, for helpers that listen on it (controls).
const elements = new WeakMap<CanvasHandle, () => HTMLCanvasElement | undefined>();

/** The `<canvas>` element of `canvas`, once it exists. Internal to the package. */
export function canvasElement(canvas: CanvasHandle): HTMLCanvasElement | undefined {
  return elements.get(canvas)?.();
}

/**
 * Registers a Frame callback that belongs to no owner: it runs until the returned function is called. Internal to
 * the package, for helpers that render continuously only for a while.
 */
export function addFrameCallback(canvas: CanvasHandle, callback: FrameCallback): () => void {
  return registries.get(canvas)!.frame(callback);
}

/** Makes `camera` the Active camera of `canvas` until the claim is released. Internal to the package. */
export function claimCamera(canvas: CanvasHandle, camera: Camera): CameraClaim {
  return cameraStacks.get(canvas)!(camera);
}

// Fits a camera to the canvas's aspect ratio, then updates its projection matrix, so prop writes to `fov`, `zoom` or
// an orthographic frustum show too. An orthographic camera keeps its top and bottom and its horizontal center.
function fit(camera: Camera, { width, height }: CanvasSize) {
  const aspect = width > 0 && height > 0 ? width / height : undefined;
  if ((camera as PerspectiveCamera).isPerspectiveCamera) {
    const perspective = camera as PerspectiveCamera;
    if (aspect !== undefined) perspective.aspect = aspect;
    perspective.updateProjectionMatrix();
  } else if ((camera as OrthographicCamera).isOrthographicCamera) {
    const orthographic = camera as OrthographicCamera;
    if (aspect !== undefined) {
      const center = (orthographic.left + orthographic.right) / 2;
      const half = ((orthographic.top - orthographic.bottom) / 2) * aspect;
      orthographic.left = center - half;
      orthographic.right = center + half;
    }
    orthographic.updateProjectionMatrix();
  }
}

// Every Canvas mounted in the page, for `invalidate()`.
const mounted = new Set<CanvasHandle>();

/** Invalidates every Canvas in the page. Inside a Canvas, `useCanvas().invalidate()` asks only that one. */
export function invalidate() {
  for (const handle of mounted) handle.invalidate();
}

const DEFAULT_POSITION = [0, 0, 5] as const;

const defaultRenderer: RendererFactory = (canvas) => new WebGLRenderer({ canvas, antialias: true });

function isThenable<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as { then?: unknown }).then === 'function';
}

// Frees the GPU context right away instead of when the canvas is garbage-collected: browsers cap how many WebGL
// contexts a page may hold.
function release(renderer: CanvasRenderer) {
  renderer.dispose();
  (renderer as { forceContextLoss?: () => void }).forceContextLoss?.();
}

/**
 * The root of a scene: a `<canvas>` that fills its parent, the scene, the default camera and the renderer. Every
 * Scene component inside it belongs to its scene. By default a Frame renders on the animation frame after something
 * changes the scene (see `frameloop`).
 */
export function Canvas(props: CanvasProps) {
  const others = omit(props, 'renderer', 'camera', 'frameloop', 'fallback', 'children', 'style');
  let canvas: HTMLCanvasElement | undefined;

  const scene = new Scene();
  const camera = new PerspectiveCamera(75, 1, 0.1, 1000);
  camera.position.set(...DEFAULT_POSITION);

  // On the server the scene never mounts; while hydrating, it mounts once hydration has finished, since the server
  // rendered none of it. A client-only render mounts it at once.
  const hydrating = !isServer && isHydrating();
  const [sceneMounted, setSceneMounted] = createSignal(!isServer && !hydrating, { name: 'Canvas.sceneMounted' });
  // Whether a Frame has rendered yet, which ends the fallback. Written by the first Frame, wherever it renders from.
  // Without a fallback there is nothing to end. Whether there is one is read once.
  const hasFallback = untrack(() => 'fallback' in props);
  let firstDrawn = !hasFallback;
  const [drawn, setDrawn] = createSignal(false, { name: 'Canvas.drawn', ownedWrite: true });

  // The renderer as a plain variable too: Frames render with it as soon as it arrives, before the signal commits.
  let active: CanvasRenderer | undefined;
  let time = 0;
  const entries = new Set<{ callback: FrameCallback }>();
  // The Active camera stack: the last claim draws, the default camera when there is none. `drawing` and `measured` are
  // plain variables for the same reason as `active`.
  const claims: Array<{ camera: Camera }> = [];
  let drawing: Camera = camera;
  let measured: CanvasSize = { width: 0, height: 0 };
  // Render callbacks in registration order; the first draws. More than one stands only for a moment (a replacement
  // registers before what it replaces is disposed), or by mistake, which `onRender` reports in development.
  const draws: Array<{ callback: RenderCallback }> = [];
  const render = (delta: number) => {
    if (!active) return false;
    time += delta;
    // A snapshot: callbacks registered during this Frame run from the next one; unregistered ones don't run.
    for (const entry of Array.from(entries)) if (entries.has(entry)) entry.callback(handle, delta);
    fit(drawing, measured);
    const draw = draws[0];
    if (draw) draw.callback(handle, delta);
    else active.render(scene, drawing);
    if (!firstDrawn) {
      firstDrawn = true;
      setDrawn(true);
    }
    return true;
  };
  const loop = createFrameLoop(render, untrack(() => props.frameloop) ?? 'demand');

  const [renderer, setRenderer] = createSignal<CanvasRenderer | undefined>(undefined, { name: 'Canvas.renderer' });
  const pointerEvents = createPointerEvents(scene, () => drawing);
  const [activeCamera, setActiveCamera] = createSignal<Camera>(camera, { name: 'Canvas.activeCamera' });
  const restack = () => {
    const top = claims.at(-1)?.camera ?? camera;
    if (top === drawing) return;
    drawing = top;
    setActiveCamera(() => top);
    loop.invalidate();
  };
  const [size, setSize] = createSignal<CanvasSize>(
    { width: 0, height: 0 },
    { name: 'Canvas.size', equals: (a, b) => a.width === b.width && a.height === b.height },
  );

  createEffect(
    () => {
      const options = props.camera;
      const position = options?.position ?? DEFAULT_POSITION;
      return {
        fov: options?.fov ?? 75,
        near: options?.near ?? 0.1,
        far: options?.far ?? 1000,
        position: [position[0], position[1], position[2]] as const,
      };
    },
    ({ fov, near, far, position }) => {
      camera.fov = fov;
      camera.near = near;
      camera.far = far;
      camera.position.set(...position);
      camera.updateProjectionMatrix();
      loop.invalidate();
    },
    { name: 'Canvas.camera' },
  );

  createEffect(
    () => props.frameloop ?? 'demand',
    (mode) => loop.setMode(mode),
    { name: 'Canvas.frameloop', defer: true },
  );

  createEffect(
    () => ({ current: renderer(), size: size() }),
    ({ current, size }) => {
      if (!current) return;
      current.setSize(size.width, size.height, false);
      loop.invalidate();
    },
    { name: 'Canvas.rendererSize' },
  );

  onSettled(() => {
    if (!canvas) return;
    if (hydrating) setSceneMounted(true);
    const element = canvas;
    let disposed = false;
    let current: CanvasRenderer | undefined;
    const adopt = (made: CanvasRenderer) => {
      if (disposed) return release(made);
      current = made;
      active = made;
      made.setPixelRatio(window.devicePixelRatio);
      setRenderer(made);
      loop.ready();
      loop.invalidate();
    };
    const made = (untrack(() => props.renderer) ?? defaultRenderer)(element);
    if (isThenable(made)) void made.then(adopt);
    else adopt(made);

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      measured = { width: entry.contentRect.width, height: entry.contentRect.height };
      setSize(measured);
    });
    observer.observe(element);
    const stopListening = pointerEvents.listen(element);

    mounted.add(handle);

    return () => {
      disposed = true;
      mounted.delete(handle);
      loop.dispose();
      observer.disconnect();
      stopListening();
      active = undefined;
      if (current) release(current);
    };
  });

  const handle: CanvasHandle = {
    scene,
    camera,
    activeCamera,
    renderer,
    size,
    get time() {
      return time;
    },
    advance(delta = 0) {
      if (!render(delta)) return false;
      loop.rendered();
      return true;
    },
    invalidate: loop.invalidate,
  };
  interactives.set(handle, pointerEvents.register);
  elements.set(handle, () => canvas);
  cameraStacks.set(handle, (claimed) => {
    const entry = { camera: claimed };
    claims.push(entry);
    restack();
    return {
      swap(next) {
        entry.camera = next;
        restack();
      },
      release() {
        const index = claims.indexOf(entry);
        if (index === -1) return;
        claims.splice(index, 1);
        restack();
      },
    };
  });
  // Each entry is its own object, so one function registered twice runs twice. The hold keeps the loop running.
  registries.set(handle, {
    frame(callback) {
      const entry = { callback };
      entries.add(entry);
      const release = loop.hold();
      return () => {
        entries.delete(entry);
        release();
      };
    },
    render(callback) {
      const entry = { callback };
      draws.push(entry);
      loop.invalidate();
      return () => {
        const index = draws.indexOf(entry);
        if (index === -1) return;
        draws.splice(index, 1);
        if (index === 0) loop.invalidate();
      };
    },
    renders: () => draws.length,
  });

  return (
    <>
      <canvas
        ref={(el: HTMLCanvasElement) => (canvas = el)}
        {...others}
        style={{ display: 'block', width: '100%', height: '100%', ...props.style }}
      />
      {hasFallback && <Show when={!drawn()}>{props.fallback}</Show>}
      <CanvasContext value={handle}>
        <ParentContext value={() => scene}>
          <Show when={sceneMounted()}>{props.children}</Show>
        </ParentContext>
      </CanvasContext>
    </>
  );
}

/** The Canvas the calling component is inside. Throws outside a Canvas. */
export function useCanvas(): CanvasHandle {
  return useContext(CanvasContext);
}

/**
 * Registers a Frame callback on the Canvas the calling component is inside: it runs before every Frame, after the
 * callbacks registered before it, until the current owner is disposed. While any is registered, a Canvas with
 * `frameloop="demand"` renders on every animation frame. Throws outside a Canvas.
 */
export function onFrame(callback: FrameCallback): void {
  const unregister = registries.get(useCanvas())!.frame(callback);
  onCleanup(unregister);
}

/**
 * Registers the Render callback of the Canvas the calling component is inside: until the current owner is disposed,
 * it draws every Frame in place of `renderer.render(scene, camera)`, after the Frame callbacks. A Canvas has at most
 * one; registering a second throws in development and is ignored in production. It doesn't make the Canvas render
 * continuously. Throws outside a Canvas.
 */
export function onRender(callback: RenderCallback): void {
  const registry = registries.get(useCanvas())!;
  onCleanup(registry.render(callback));
  // Checked once settled: by then, a Render callback this one replaces has been disposed.
  if (DEV) {
    onSettled(() => {
      if (registry.renders() > 1) {
        throw new Error('@solid-slopkit/threejs: a Canvas has at most one Render callback, and this one already has one');
      }
    });
  }
}
