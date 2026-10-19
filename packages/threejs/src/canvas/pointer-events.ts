import { Raycaster, Vector2, type Camera, type Intersection, type Object3D, type Ray, type Scene } from 'three';

/**
 * A pointer event delivered to an Interactive Instance. `E` is the DOM event behind it; `I` is `Intersection` where a
 * hit is certain, and `Intersection | undefined` where the Instance may not be hit (a captured pointer that misses it,
 * a pointer leaving it).
 */
export interface ScenePointerEvent<E extends MouseEvent = PointerEvent, I extends Intersection | undefined = Intersection> {
  /** The DOM event on the `<canvas>`. */
  readonly nativeEvent: E;
  /** The nearest hit that led to this Instance: `intersection.object` is the object the ray hit. */
  readonly intersection: I;
  /** The Instance whose handler is running. */
  readonly object: Object3D;
  /** The pointer in normalized device coordinates: -1 to 1 across the canvas, y up. */
  readonly pointer: Vector2;
  /** The ray cast from the camera through the pointer. */
  readonly ray: Ray;
  /** The camera the ray was cast from: the Active camera. */
  readonly camera: Camera;
  /** The DOM event's `pointerId`; `undefined` for a wheel event. */
  readonly pointerId: number | undefined;
  readonly button: number;
  readonly buttons: number;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  /** Stops delivery: no Instance after this one gets the event, neither an ancestor nor a farther hit. */
  stopPropagation(): void;
  /**
   * Sends this pointer's later move and up events to this Instance, and its Interactive ancestors, wherever the
   * pointer goes, until it is released, lifted or cancelled. Does nothing without a `pointerId`.
   */
  setPointerCapture(): void;
  /** Ends a capture this Instance holds. */
  releasePointerCapture(): void;
}

/** The pointer event handlers a Scene component of an `Object3D` takes. */
export interface PointerEventProps {
  onClick?: (event: ScenePointerEvent<MouseEvent>) => void;
  onContextMenu?: (event: ScenePointerEvent<MouseEvent>) => void;
  onPointerDown?: (event: ScenePointerEvent) => void;
  /** While the pointer is captured, it runs even when the ray misses, with no `intersection`. */
  onPointerUp?: (event: ScenePointerEvent<PointerEvent, Intersection | undefined>) => void;
  /** While the pointer is captured, it runs even when the ray misses, with no `intersection`. */
  onPointerMove?: (event: ScenePointerEvent<PointerEvent, Intersection | undefined>) => void;
  /** The nearest hovered Instance changed to this one or one below it. Bubbles. */
  onPointerOver?: (event: ScenePointerEvent) => void;
  /** The nearest hovered Instance changed away from this one or one below it. Bubbles. */
  onPointerOut?: (event: ScenePointerEvent<PointerEvent, Intersection | undefined>) => void;
  /** This Instance became hovered. Doesn't bubble. */
  onPointerEnter?: (event: ScenePointerEvent) => void;
  /** This Instance stopped being hovered. Doesn't bubble. */
  onPointerLeave?: (event: ScenePointerEvent<PointerEvent, Intersection | undefined>) => void;
  onWheel?: (event: ScenePointerEvent<WheelEvent>) => void;
}

export type PointerEventName = keyof PointerEventProps;

export const POINTER_EVENT_PROPS: ReadonlySet<string> = new Set<PointerEventName>([
  'onClick',
  'onContextMenu',
  'onPointerDown',
  'onPointerUp',
  'onPointerMove',
  'onPointerOver',
  'onPointerOut',
  'onPointerEnter',
  'onPointerLeave',
  'onWheel',
]);

/** Reads an Interactive Instance's current handler for one event. */
export type HandlerLookup = (name: PointerEventName) => ((event: any) => void) | undefined;

/** An Instance's place among a Canvas's Interactive Instances. */
export interface InteractiveClaim {
  /** Puts another Instance in this claim's place (a Rebuild). */
  swap(instance: Object3D): void;
  release(): void;
}

interface Entry {
  readonly object: Object3D;
  readonly intersection: Intersection | undefined;
}

export interface PointerEvents {
  register(instance: Object3D, handlers: HandlerLookup): InteractiveClaim;
  /** Listens on the `<canvas>`. Returns what stops listening. */
  listen(element: HTMLCanvasElement): () => void;
}

/** Hit-tests Interactive Instances on pointer events over a Canvas, and delivers the events to their handlers. */
export function createPointerEvents(scene: Scene, camera: () => Camera): PointerEvents {
  const interactive = new Map<Object3D, HandlerLookup>();
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  // The Instances the last move reached, nearest first.
  let hovered: Entry[] = [];
  const captures = new Map<number, Object3D>();
  let element: HTMLCanvasElement | undefined;

  const inScene = (object: Object3D) => {
    let current: Object3D | null = object;
    while (current.parent) current = current.parent;
    return current === scene;
  };
  const underInteractive = (object: Object3D) => {
    for (let current = object.parent; current; current = current.parent) if (interactive.has(current)) return true;
    return false;
  };

  const cast = (native: MouseEvent) => {
    const rect = element!.getBoundingClientRect();
    pointer.set(((native.clientX - rect.left) / rect.width) * 2 - 1, -((native.clientY - rect.top) / rect.height) * 2 + 1);
    const view = camera();
    // Props written since the last Frame are hit where they now are.
    scene.updateMatrixWorld();
    view.updateWorldMatrix(true, false);
    raycaster.setFromCamera(pointer, view);
    return view;
  };

  // Every hit, nearest first, each followed by its Interactive ancestors; each Instance once, with its nearest hit.
  const hitPath = (): Entry[] => {
    // A root under another Interactive Instance is reached by that one's recursive cast.
    const roots = [...interactive.keys()].filter((object) => inScene(object) && !underInteractive(object));
    const path: Entry[] = [];
    const seen = new Set<Object3D>();
    for (const hit of raycaster.intersectObjects(roots, true)) {
      for (let current: Object3D | null = hit.object; current; current = current.parent) {
        if (interactive.has(current) && !seen.has(current)) {
          seen.add(current);
          path.push({ object: current, intersection: hit });
        }
      }
    }
    return path;
  };

  // A captured pointer: the capturing Instance and its Interactive ancestors, hit or not.
  const capturePath = (captured: Object3D): Entry[] => {
    const intersection = raycaster.intersectObject(captured, true)[0];
    const path: Entry[] = [];
    for (let current: Object3D | null = captured; current; current = current.parent) {
      if (interactive.has(current)) path.push({ object: current, intersection });
    }
    return path;
  };

  // Delivers to each entry in order until one stops it. Returns how many entries it reached.
  const deliver = (name: PointerEventName, path: Entry[], native: MouseEvent, view: Camera, bubbles = true) => {
    let stopped = false;
    const ray = raycaster.ray.clone();
    const at = pointer.clone();
    const pointerId = 'pointerId' in native ? (native as PointerEvent).pointerId : undefined;
    let reached = 0;
    for (const { object, intersection } of path) {
      reached++;
      const handler = interactive.get(object)?.(name);
      if (handler) {
        const event: ScenePointerEvent<MouseEvent, Intersection | undefined> = {
          nativeEvent: native,
          intersection,
          object,
          pointer: at,
          ray,
          camera: view,
          pointerId,
          button: native.button,
          buttons: native.buttons,
          altKey: native.altKey,
          ctrlKey: native.ctrlKey,
          metaKey: native.metaKey,
          shiftKey: native.shiftKey,
          stopPropagation: () => (stopped = true),
          setPointerCapture() {
            if (pointerId === undefined) return;
            captures.set(pointerId, object);
            try {
              element?.setPointerCapture(pointerId);
            } catch {
              // The pointer isn't active (a synthetic event): the capture still holds for the Instance.
            }
          },
          releasePointerCapture() {
            if (pointerId === undefined || captures.get(pointerId) !== object) return;
            release(pointerId);
          },
        };
        handler(event);
      }
      if (bubbles && stopped) break;
    }
    return reached;
  };

  const release = (pointerId: number) => {
    captures.delete(pointerId);
    if (element?.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId);
  };

  // Moves the hovered set to `next`: Out and Over when the nearest hovered Instance changes, then Leave and Enter for
  // each Instance that left or joined.
  const hover = (next: Entry[], native: PointerEvent, view: Camera) => {
    const previous = hovered;
    hovered = next;
    const now = new Map(next.map((entry) => [entry.object, entry.intersection]));
    const before = new Set(previous.map((entry) => entry.object));
    const leaving = previous.map(({ object }) => ({ object, intersection: now.get(object) }));
    if (previous[0]?.object !== next[0]?.object) {
      if (previous.length > 0) deliver('onPointerOut', leaving, native, view);
      if (next.length > 0) deliver('onPointerOver', next, native, view);
    }
    const left = leaving.filter(({ object }) => !now.has(object));
    if (left.length > 0) deliver('onPointerLeave', left, native, view, false);
    const entered = next.filter(({ object }) => !before.has(object));
    if (entered.length > 0) deliver('onPointerEnter', entered, native, view, false);
  };

  const onPointer = (name: 'onPointerDown' | 'onPointerUp' | 'onPointerMove') => (native: PointerEvent) => {
    const captured = captures.get(native.pointerId);
    if (interactive.size === 0 && !captured) return;
    const view = cast(native);
    if (captured) {
      deliver(name, capturePath(captured), native, view);
      if (name === 'onPointerUp') release(native.pointerId);
      return;
    }
    const path = hitPath();
    const reached = deliver(name, path, native, view);
    if (name === 'onPointerMove') hover(path.slice(0, reached), native, view);
  };
  const onHit = (name: 'onClick' | 'onContextMenu' | 'onWheel') => (native: MouseEvent) => {
    if (interactive.size === 0) return;
    const view = cast(native);
    deliver(name, hitPath(), native, view);
  };
  const onCancel = (native: PointerEvent) => {
    captures.delete(native.pointerId);
    onLeave(native);
  };
  const onLeave = (native: PointerEvent) => {
    if (captures.has(native.pointerId) || hovered.length === 0) return;
    hover([], native, cast(native));
  };

  const forget = (object: Object3D) => {
    hovered = hovered.filter((entry) => entry.object !== object);
    for (const [pointerId, captured] of captures) if (captured === object) release(pointerId);
  };

  return {
    register(instance, handlers) {
      let current = instance;
      interactive.set(current, handlers);
      return {
        swap(next) {
          interactive.delete(current);
          forget(current);
          current = next;
          interactive.set(current, handlers);
        },
        release() {
          interactive.delete(current);
          forget(current);
        },
      };
    },
    listen(canvas) {
      element = canvas;
      const listeners: Array<[string, (event: any) => void]> = [
        ['pointerdown', onPointer('onPointerDown')],
        ['pointerup', onPointer('onPointerUp')],
        ['pointermove', onPointer('onPointerMove')],
        ['pointercancel', onCancel],
        ['pointerleave', onLeave],
        ['click', onHit('onClick')],
        ['contextmenu', onHit('onContextMenu')],
        ['wheel', onHit('onWheel')],
      ];
      for (const [type, listener] of listeners) canvas.addEventListener(type, listener);
      return () => {
        for (const [type, listener] of listeners) canvas.removeEventListener(type, listener);
        element = undefined;
      };
    },
  };
}
