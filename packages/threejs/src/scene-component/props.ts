import { createRenderEffect } from 'solid-js';
import { Color, type ColorRepresentation } from 'three';

/** Props that configure the Scene component itself rather than a property of its Instance. */
export const RESERVED_PROPS = new Set(['args', 'object', 'attach', 'dispose', 'ref', 'children']);

type Settable = { set(...args: unknown[]): unknown; setScalar?: (scalar: number) => unknown; copy?: (v: unknown) => unknown };

function isSettable(value: unknown): value is Settable {
  return value !== null && typeof value === 'object' && typeof (value as Settable).set === 'function';
}

/** An object literal (or a store's view of one), as opposed to an instance of a class. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// Writes a Partial value: each field it lists, with the same rules as a prop, and nothing else. A field the object
// doesn't have is skipped: the object may be a stand-in until Attach fills the property (a Mesh's default
// MeshBasicMaterial has no `emissive`), and TypeScript checks the fields of an object literal.
function applyPartial(target: object, partial: Record<string, unknown>) {
  for (const [field, value] of Object.entries(partial)) {
    if (field in target) applyProp(target, field, value);
  }
}

/**
 * Writes one prop to an Instance. A property that holds a math object (anything with `set`) is copied into, never
 * replaced, so code holding that object keeps seeing the Instance's value: a `Color` takes whatever `Color.set`
 * takes, an array spreads into `set`, a number goes to `setScalar` (or `set`, for a one-argument type like `Layers`),
 * and an object of the same type is copied. A Partial value (an object literal for a property that holds an instance
 * of a class) writes only the fields it lists that the object has, at any depth; for an empty (`null`) property it
 * waits until Attach fills it. `undefined` leaves a math object as it is. Anything else is assigned.
 */
export function applyProp(instance: object, key: string, value: unknown) {
  const target = instance as Record<string, unknown>;
  const current = target[key];
  if (isPlainObject(value) && current !== undefined && !isPlainObject(current)) {
    if (current !== null && typeof current === 'object') applyPartial(current, value);
    return;
  }
  if (!isSettable(current)) {
    target[key] = value;
    return;
  }
  if (value === undefined || value === current) return;
  if (current instanceof Color && !Array.isArray(value)) current.set(value as ColorRepresentation);
  else if (Array.isArray(value)) current.set(...value);
  else if (typeof value === 'number') {
    if (typeof current.setScalar === 'function') current.setScalar(value);
    else current.set(value);
  } else if (
    value !== null &&
    typeof value === 'object' &&
    value.constructor === current.constructor &&
    typeof current.copy === 'function'
  ) {
    current.copy(value);
  } else target[key] = value;
}

// The Partial values bound to each Instance, by property. When Attach puts a new object in that property, they are
// written again to it: `material={{ opacity: 0.5 }}` on a Mesh reaches the material a child attaches after it.
const partialBindings = new WeakMap<object, Map<string, () => void>>();

/** Writes the Partial value bound to `instance[key]` again. Attach calls it after it changes that property. */
export function reapplyPartial(instance: object, key: PropertyKey) {
  if (typeof key === 'string') partialBindings.get(instance)?.get(key)?.();
}

function registerPartial(instance: object, key: string, reapply: () => void): () => void {
  let byKey = partialBindings.get(instance);
  if (!byKey) partialBindings.set(instance, (byKey = new Map()));
  byKey.set(key, reapply);
  return () => {
    if (byKey.get(key) === reapply) byKey.delete(key);
  };
}

/** A copy of arrays and object literals, made in a tracked read so a store's nested values are read (and tracked) there. */
export function copyPlain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copyPlain);
  if (isPlainObject(value)) {
    const copy: Record<string, unknown> = {};
    for (const [field, nested] of Object.entries(value)) copy[field] = copyPlain(nested);
    return copy;
  }
  return value;
}

/**
 * Binds every prop that isn't reserved to the current Instance, each through its own render effect: the first write
 * happens now, so the Instance is set up before it is attached, and a change re-runs only that prop's binding. A
 * Rebuild re-runs them all, onto the new Instance. Every write Invalidates the Canvas. Which props there are is read
 * once; their values are reactive.
 */
export function bindProps(
  instance: () => object,
  props: Record<string, unknown>,
  name: string,
  invalidate: () => void,
  // Props of the component's own beyond the reserved ones, such as a camera's `active`.
  own?: ReadonlySet<string>,
) {
  for (const key of Object.keys(props)) {
    if (RESERVED_PROPS.has(key) || own?.has(key)) continue;
    createRenderEffect(
      // Values are copied here, in the tracked read: a store's nested values are never read in the apply phase.
      () => ({ target: instance(), value: copyPlain(props[key]) }),
      ({ target, value }) => {
        applyProp(target, key, value);
        invalidate();
        if (isPlainObject(value)) return registerPartial(target, key, () => applyProp(target, key, value));
      },
      { name: `${name}.${key}` },
    );
  }
}
