import { createEffect, createMemo, createRenderEffect, onCleanup, untrack, useContext } from 'solid-js';
import type { JSX } from '@solidjs/web';
import type { Camera, Color, ColorRepresentation, Object3D } from 'three';
import { attach, type Attach, type Attachment } from './attach';
import { claimCamera, claimInteractive, useCanvas, type CameraClaim } from '../canvas/canvas';
import { POINTER_EVENT_PROPS, type PointerEventName, type PointerEventProps } from '../canvas/pointer-events';
import { ParentContext } from './parent';
import { bindProps, copyPlain } from './props';

/** A three.js class a Scene component can wrap. */
export type SceneClass = new (...args: any[]) => object;

/** A ref to an Instance: a variable (`ref={mesh}`), a callback, or an array of them. */
export type SceneRef<Instance> = Instance | ((instance: Instance) => void) | undefined | SceneRef<Instance>[];

/** The props every Scene component takes. */
export interface SceneComponentProps<Instance, Args extends unknown[]> {
  /** The constructor arguments of the Instance. A change rebuilds it: a new Instance takes the old one's place. */
  args?: Args;
  /**
   * An existing Instance to adopt instead of constructing one: it is attached and detached but never disposed. A change
   * puts the new object in the old one's place. Whether the component adopts is decided once, by whether it has this prop.
   */
  object?: Instance;
  /** Where the Instance goes in its parent, when the default isn't right. Read once. */
  attach?: Attach<any, Instance>;
  /** Pass `false` to keep the Instance alive after the component is gone, instead of disposing it. An Adopted Instance is never disposed. */
  dispose?: boolean;
  /** Receives the Instance once it is attached, and again with the new one after each Rebuild. */
  ref?: SceneRef<Instance>;
  /** Scene components that attach to this Instance. */
  children?: JSX.Element;
}

/** The props a camera's Scene component takes on top of the others. */
export interface CameraProps {
  /**
   * Makes the camera the Canvas's Active camera while `true`. The camera made active most recently wins; when it is
   * deactivated or disposed, the one before it is active again.
   */
  active?: boolean;
}

type Method = (...args: any[]) => any;

type FieldKeys<O> = { [F in keyof O & string]: O[F] extends Method ? never : F }[keyof O & string];

/**
 * A Partial value: an object literal listing some fields of the object a property holds, each taking what a prop for
 * it would take, at any depth. Only the fields it lists are written.
 */
export type PartialValue<O> = { [F in FieldKeys<O>]?: PropValue<O[F]> };

/**
 * What a prop for one property of an Instance accepts: for a `Color`, anything `Color.set` takes; for another math
 * object, the object, its `set` arguments as an array, and a number when it has `setScalar` or a one-argument `set`;
 * for any other object, a Partial value too.
 */
export type PropValue<V> = V extends Color
  ? ColorRepresentation | [r: number, g: number, b: number] | PartialValue<Color>
  : V extends { set(...args: infer A): unknown }
    ?
        | V
        | A
        | (V extends { setScalar(scalar: number): unknown } ? number : A extends [infer Only] ? Only : never)
        | PartialValue<V>
    : V extends Method | readonly unknown[]
      ? V
      : V extends object
        ? V | PartialValue<V>
        : V;

// A camera's `active` and an Object3D's pointer event handlers are the component's own; on any other Instance they're
// Instance props.
type Reserved<Instance> =
  | keyof SceneComponentProps<unknown, unknown[]>
  | (Instance extends Camera ? keyof CameraProps : never)
  | (Instance extends Object3D ? keyof PointerEventProps : never);

/** A prop for every property of an Instance that isn't a method. */
export type InstanceProps<Instance> = {
  [K in keyof Instance as K extends Reserved<Instance> ? never : Instance[K] extends Method ? never : K]?: PropValue<Instance[K]>;
};

/** A component that wraps one three.js class and manages its Instance. */
export type SceneComponent<C extends SceneClass> = (
  props: SceneComponentProps<InstanceType<C>, ConstructorParameters<C>> &
    InstanceProps<InstanceType<C>> &
    (InstanceType<C> extends Camera ? CameraProps : unknown) &
    (InstanceType<C> extends Object3D ? PointerEventProps : unknown) &
    // An Instance comes from `args` or from `object`, never both.
    ({ args?: ConstructorParameters<C>; object?: never } | { args?: never; object: InstanceType<C> }),
) => JSX.Element;

const CAMERA_PROPS: ReadonlySet<string> = new Set(['active']);

function callRef<Instance>(ref: SceneRef<Instance>, instance: Instance) {
  if (typeof ref === 'function') (ref as (instance: Instance) => void)(instance);
  else if (Array.isArray(ref)) for (const each of ref) callRef(each, instance);
}

function sameArgs(a: unknown[], b: unknown[]) {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

type SourceProps = { args?: unknown[]; object?: unknown; dispose?: boolean };

// An Owned Instance. A Rebuild is this memo running again; its cleanup disposes the Instance it made, before the next
// one is made and when the component's owner is disposed.
function ownedInstance<C extends SceneClass>(Class: C, props: SourceProps, name: string) {
  const args = createMemo(() => copyPlain(props.args ?? []) as unknown[], { name: `${name}.args`, equals: sameArgs });
  return createMemo(
    () => {
      const made = new Class(...args()) as InstanceType<C>;
      onCleanup(() => {
        if (untrack(() => props.dispose) !== false) (made as { dispose?: () => void }).dispose?.();
      });
      return made;
    },
    { name: `${name}.instance` },
  );
}

// An Adopted Instance: whatever `object` holds, never disposed. A new object takes the old one's place, like a Rebuild.
function adoptedInstance<Instance extends object>(props: SourceProps, name: string) {
  return createMemo(
    () => {
      const object = props.object;
      if (object === null || typeof object !== 'object') {
        throw new Error(`${name} got ${object === null ? 'null' : typeof object} as its object; it adopts an existing Instance.`);
      }
      return object as Instance;
    },
    { name: `${name}.instance` },
  );
}

/**
 * Makes a Scene component for a three.js class: an add-on from `three/examples`, a class of your own, or any class
 * the `T` namespace doesn't have. The component constructs its Instance from `args`, attaches it to the Instance of
 * the Scene component around it (or to the Canvas's scene), and on disposal detaches it and calls its `dispose()`.
 * Every other prop sets the property of the same name on the Instance, copying into math objects; an object literal
 * writes only the fields it lists. When `args` changes, a Rebuild puts a new Instance in the old one's place. With
 * `object`, it adopts an existing Instance instead, and never disposes it.
 */
export function sceneComponent<C extends SceneClass>(Class: C): SceneComponent<C> {
  const Component: SceneComponent<C> = (props) => {
    const name = Class.name;
    const parent = useContext(ParentContext);
    // Every change this component makes to the scene asks its Canvas for a Frame.
    const canvas = useCanvas();
    const { invalidate } = canvas;

    const instance = untrack(() => 'object' in props)
      ? adoptedInstance<InstanceType<C>>(props, name)
      : ownedInstance(Class, props, name);

    // Whether the Instance is a camera (and takes `active`) and an Object3D (and takes pointer event handlers) is
    // decided once.
    const first = untrack(instance) as Partial<Camera>;
    const camera = first.isCamera === true;
    const object3d = first.isObject3D === true;
    const own = new Set([...(camera ? CAMERA_PROPS : []), ...(object3d ? POINTER_EVENT_PROPS : [])]);

    // Created before Attach, so the props are on the Instance before it joins its parent, at mount and on a Rebuild.
    // oxlint-disable-next-line solid/reactivity -- bindProps reads the accessor inside its own render effects
    bindProps(instance, props, name, invalidate, own);

    // Attach follows the parent: a Rebuild of the parent detaches this Instance from the old one and attaches it to
    // the new one. A Rebuild of this component swaps the new Instance into the old one's place instead.
    let attachment: Attachment | undefined;
    createRenderEffect(
      () => parent(),
      (into) => {
        const current = attach(
          into,
          untrack(instance),
          untrack(() => props.attach),
        );
        attachment = current;
        invalidate();
        return () => {
          current.detach();
          if (attachment === current) attachment = undefined;
          invalidate();
        };
      },
      { name: `${name}.attach` },
    );
    createRenderEffect(
      () => instance(),
      (next) => {
        attachment?.swap(next);
        invalidate();
      },
      { name: `${name}.swap`, defer: true },
    );

    // An Interactive Instance has at least one handler prop. Which ones it has is read once; each is read when its
    // event is delivered, so it can change.
    if (object3d && untrack(() => Object.keys(props).some((key) => POINTER_EVENT_PROPS.has(key)))) {
      const handlers = props as Record<PointerEventName, ((event: any) => void) | undefined>;
      const interactive = claimInteractive(canvas, untrack(instance) as Object3D, (event) => untrack(() => handlers[event]));
      onCleanup(() => interactive.release());
      createRenderEffect(
        () => instance(),
        (next) => interactive.swap(next as Object3D),
        { name: `${name}.interactiveSwap`, defer: true },
      );
    }

    if (camera) {
      // A claim on the Active camera stack while `active`; a Rebuild keeps the claim's place in the stack. Plain
      // effects: a claim writes the Canvas's activeCamera signal, and no Frame draws before effects run.
      let claim: CameraClaim | undefined;
      createEffect(
        () => (props as CameraProps).active === true,
        (active) => {
          if (!active) return;
          const current = claimCamera(canvas, untrack(instance) as Camera);
          claim = current;
          return () => {
            current.release();
            if (claim === current) claim = undefined;
          };
        },
        { name: `${name}.active` },
      );
      createEffect(
        () => instance(),
        (next) => claim?.swap(next as Camera),
        { name: `${name}.activeSwap`, defer: true },
      );
    }

    // The ref gets the Instance at mount, and after a Rebuild once the children have moved to the new one.
    callRef(
      untrack(() => props.ref),
      untrack(instance),
    );
    createEffect(
      () => instance(),
      (next) =>
        callRef(
          untrack(() => props.ref),
          next,
        ),
      { name: `${name}.ref`, defer: true },
    );

    return <ParentContext value={instance}>{props.children}</ParentContext>;
  };
  Object.defineProperty(Component, 'name', { value: Class.name });
  return Component;
}
