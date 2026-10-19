import { BufferGeometry, Material, Object3D } from 'three';
import { reapplyPartial } from './props';

/** Attaches `self` to `parent` by hand, returning what detaches it again. */
export type AttachFn<Parent = any, Self = any> = (parent: Parent, self: Self) => () => void;

/**
 * Where an Instance goes in its parent: a property path (`'fog'`, `'material.map'`, `'material.0'`) or a function.
 * Without one, an `Object3D` is added as a child, a `BufferGeometry` goes to `geometry` and a `Material` to `material`.
 */
export type Attach<Parent = any, Self = any> = string | AttachFn<Parent, Self>;

/** An Instance attached to its parent. */
export interface Attachment {
  /** Puts `next` where the Instance is, in its place: the same position among the children, the same claim on a slot. */
  swap(next: unknown): void;
  /** Detaches it, restoring what was there before. */
  detach(): void;
}

// One property slot (an object and a key) that several Instances may claim at once, as when a `<Show>` swaps two
// materials. The slot shows the most recent claim still standing, and the value it had before any claim when none is.
// Each change writes the parent's Partial value for that property again (`material={{ opacity: 0.5 }}` onto the new
// material).
interface Slot {
  original: unknown;
  claims: Array<{ value: unknown }>;
}

const slots = new WeakMap<object, Map<PropertyKey, Slot>>();

function claim(target: Record<PropertyKey, unknown>, key: PropertyKey, value: unknown): Attachment {
  let byKey = slots.get(target);
  if (!byKey) slots.set(target, (byKey = new Map()));
  let slot = byKey.get(key);
  if (!slot) byKey.set(key, (slot = { original: target[key], claims: [] }));
  const entry = { value };
  slot.claims.push(entry);
  target[key] = value;
  reapplyPartial(target, key);

  return {
    swap(next) {
      entry.value = next;
      if (slot!.claims.at(-1) !== entry) return;
      target[key] = next;
      reapplyPartial(target, key);
    },
    detach() {
      const current = slot!;
      current.claims.splice(current.claims.indexOf(entry), 1);
      const top = current.claims.at(-1);
      target[key] = top ? top.value : current.original;
      if (!top) byKey!.delete(key);
      reapplyPartial(target, key);
    },
  };
}

function attachToPath(parent: unknown, path: string, self: unknown): Attachment {
  const keys = path.split('.');
  const last = keys.pop()!;
  let target = parent as Record<string, unknown>;
  for (const key of keys) {
    const next = target[key];
    if (next === null || typeof next !== 'object') {
      throw new Error(`Can't attach to "${path}": "${key}" is ${next === null ? 'null' : typeof next} on the parent.`);
    }
    target = next as Record<string, unknown>;
  }
  return claim(target, last, self);
}

function addChild(parent: Object3D, self: Object3D): Attachment {
  let current = self;
  parent.add(current);
  return {
    swap(next) {
      const index = parent.children.indexOf(current);
      parent.remove(current);
      current = next as Object3D;
      parent.add(current);
      // `add` appends; put it back where the one it replaces was.
      parent.children.splice(parent.children.indexOf(current), 1);
      parent.children.splice(index, 0, current);
    },
    detach() {
      parent.remove(current);
    },
  };
}

/** Attaches `self` to `parent`. Detaching restores what was there before. */
export function attach(parent: unknown, self: unknown, how: Attach | undefined): Attachment {
  if (typeof how === 'function') {
    let detach = how(parent, self);
    return {
      swap(next) {
        detach();
        detach = how(parent, next);
      },
      detach: () => detach(),
    };
  }
  if (typeof how === 'string') return attachToPath(parent, how, self);

  if (self instanceof Object3D) {
    if (!(parent instanceof Object3D)) {
      throw new Error(`Can't add ${self.type} to a parent that isn't an Object3D. Pass \`attach\` to say where it goes.`);
    }
    return addChild(parent, self);
  }
  if (self instanceof BufferGeometry) return attachToPath(parent, 'geometry', self);
  if (self instanceof Material) return attachToPath(parent, 'material', self);

  const name = (self as { constructor?: { name?: string } })?.constructor?.name ?? typeof self;
  throw new Error(`${name} has no default place in its parent. Pass \`attach\` with a property path or a function.`);
}
