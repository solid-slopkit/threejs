# Scene components

A Scene component wraps one three.js class and manages its Instance: it constructs it, attaches it to its parent, and detaches and disposes it with its owner. The `T` namespace has one for every scene-graph class three.js exports; `sceneComponent(Class)` makes one for any other class.

```tsx
import { T, sceneComponent } from '@solid-slopkit/threejs';
```

## Usage

```tsx
import { Canvas, T } from '@solid-slopkit/threejs';

<Canvas>
  <T.Mesh>
    <T.BoxGeometry args={[1, 1, 1]} />
    <T.MeshStandardMaterial />
  </T.Mesh>
</Canvas>;
```

## The T namespace

`T` holds a Scene component for each class three.js exports that is, or extends, `Object3D` (objects, cameras, lights, helpers), `BufferGeometry`, `Material`, `Texture`, `Fog` or `FogExp2`: `T.Mesh`, `T.PerspectiveCamera`, `T.PointLight`, `T.AxesHelper`, `T.BoxGeometry`, `T.MeshStandardMaterial`, `T.Texture`, `T.Fog`, and the rest. Math types (`Vector3`, `Color`), loaders and renderers aren't scene members, so they aren't in it. Neither is the abstract `Light`.

- **Tree-shaking:** `T` is a static module namespace, not an object built at runtime, so a bundler keeps only the members an app reads (`T.Mesh`) and the three.js classes they wrap. Read members directly; `Object.values(T)` or passing `T` around keeps all of them.
- **Names:** each member has its class's name, so it never clashes with the class itself: `import { Mesh } from 'three'` and `<T.Mesh>` sit side by side.
- **Versions:** `T` has only the classes that both the installed three.js and the oldest supported release (r171) export, so it works across the peer range. A class added to three.js later is reached with `sceneComponent`.

## sceneComponent

For a class `T` doesn't have, such as an add-on from `three/examples`, a newer three.js class or a subclass of your own, `sceneComponent(Class)` makes a Scene component. Make it once, at module level, not inside a component:

```tsx
import { sceneComponent } from '@solid-slopkit/threejs';
import { Water } from 'three/examples/jsm/objects/Water.js';

const WaterSurface = sceneComponent(Water);

<WaterSurface args={[geometry, options]} rotation={[-Math.PI / 2, 0, 0]} />;
```

The rest of this page holds for both.

- **Instance:** constructed with `new Class(...args)`, and constructed again when `args` changes (see Rebuild).
- **Parent:** the Instance of the Scene component around it, or the Canvas's scene at the top. A Scene component outside a Canvas throws.
- **Ref:** called once the Instance's props are applied and it is attached, with the Instance. It takes a variable (`let mesh!: Mesh; <T.Mesh ref={mesh} />`), a callback, or an array of callbacks. Children attach after it, so read their effects later (in an effect or a Frame callback), not in the ref. After a Rebuild it is called again with the new Instance, once the children have moved to it, so a variable ref always holds the current one.
- **Frames:** every prop write, Attach, detach and Rebuild Invalidates the Canvas, so it renders a Frame on the next animation frame. A change made to the Instance any other way needs `invalidate()` (see [Canvas](../canvas/canvas.md)).
- **Disposal:** when its owner is disposed (a `<Show>` turns false, a `<For>` drops its item, the Canvas goes), the Instance is detached and its `dispose()` is called, if it has one. Pass `dispose={false}` to keep an Instance you hold on to elsewhere.
- **Children:** Scene components inside it attach to its Instance. The scene is part of the component tree, so `<Show>`, `<For>`, context and your own components work inside it.

## Attach

How an Instance joins its parent:

| Instance           | Default                                                      |
| ------------------ | ------------------------------------------------------------ |
| an `Object3D`      | `parent.add(instance)`; the parent must be an `Object3D` too |
| a `BufferGeometry` | assigned to `parent.geometry`                                |
| a `Material`       | assigned to `parent.material`                                |
| anything else      | none: pass `attach`, or it throws                            |

`attach` overrides the default. Read once.

- **A property path:** `attach="fog"` on a `Fog` inside the Canvas sets `scene.fog`; `attach="material.map"` on a `Texture` inside a `Mesh` sets `mesh.material.map`. A number in the path indexes an array: `attach="material.1"`. Every key before the last must lead to an object, or it throws.
- **A function:** `attach={(parent, self) => { …; return () => { … } }}` attaches by hand and returns what detaches.

Detaching restores what was there before. When several Instances claim one property, as with two materials behind `<Show>`s, the property holds the most recent claim still standing, and its original value once none is: a `Mesh`'s material goes back to the `MeshBasicMaterial` it was constructed with.

## Rebuild

Many three.js classes take their configuration only in the constructor (a `BoxGeometry`'s size), so a change to `args` rebuilds the Instance: `<BoxGeometry args={[width(), 1, 1]} />`.

1. The old Instance is disposed (unless `dispose={false}`), and a new one is constructed from the new `args`.
2. The current props are applied to the new one.
3. It takes the old one's place: the same position among its parent's children, or the same claim on the property it was attached to (a claim made after it still wins).
4. The children move to it, in order. Their components don't run again, so their state, effects and refs survive.
5. The ref is called with it.

`args` is compared element by element (`Object.is`), so `args={[1, 1, 1]}` re-evaluated with the same numbers is not a change, but an object or array inside `args` is a new one each time. A Rebuild costs a new Instance and its GPU upload, so animate through props, not `args`.

## Adopted Instances

`object` hands a component an Instance that already exists, such as a loaded model's scene graph or a geometry shared between meshes, instead of constructing one: `<T.Group object={gltf.scene} position={[0, 1, 0]} />`.

- **Attached, never disposed:** it is attached and detached like any Instance, but never disposed, with or without `dispose`. Whoever made it disposes it.
- **Props and children:** props are written to it and Scene components inside it attach to it, as with an Owned Instance. Props it was given stay on it after it is detached.
- **A new object:** when `object` changes, the new one takes the old one's place, the children move to it and the ref is called with it, as in a Rebuild. The old one is detached, not disposed.
- **One place at a time:** an `Object3D` has one parent, so adopting the same one in two places moves it to the second. Clone it to show it twice.
- **Types:** a component takes `args` or `object`, never both, and `object` must be an instance of its class: `sceneComponent(Mesh)` adopts a `Mesh`; `sceneComponent(Object3D)` adopts any `Object3D`. Whether a component adopts is decided once, by whether it has an `object` prop; `null` or `undefined` throws.

## Instance props

Every prop that isn't one of the component's own (below) sets the Instance's property of the same name: `<T.Mesh position={[0, 1, 0]} visible={shown()} />`. Each prop is its own binding, so a change re-runs only that prop's write, and props are applied before the Instance is attached and its ref runs. Which props a component has is read once; their values are reactive.

A property that holds a math object (one with `set`: `Vector3`, `Euler`, `Quaternion`, `Color`, `Layers`, `Matrix4`, …) is copied into, never replaced, so code that holds `mesh.position` keeps seeing the current value:

| Value                      | Write                                                           | Example                                                                          |
| -------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| anything for a `Color`     | `color.set(value)`: a CSS color string, a hex number, a `Color` | `color="hotpink"`, `emissive={0x111111}`                                         |
| an array                   | `set(...value)`                                                 | `position={[0, 1, 0]}`, `rotation={[0, Math.PI, 0, 'YXZ']}`, `color={[1, 0, 0]}` |
| a number                   | `setScalar(value)`, or `set(value)` when there's no `setScalar` | `scale={2}`, `layers={1}`                                                        |
| an object of the same type | `copy(value)`                                                   | `quaternion={q}`                                                                 |
| `undefined`                | nothing: the math object keeps its value                        |                                                                                  |

Any other value is assigned: `visible={false}`, `roughness={0.5}`, `material={shared}`. The types follow the same rules (`PropValue<V>`): `position` takes a `Vector3` or `[x, y, z]`, never a string, and methods aren't props.

## Partial values

An object literal given for a property that holds an instance of a class writes only the fields it lists, with the same rules as any prop, at any depth:

```tsx
<T.Mesh position={{ y: y() }} />
<T.DirectionalLight shadow={{ mapSize: [2048, 2048], camera: { far: 50 } }} />
<T.Mesh material={{ opacity: 0.5, transparent: true }}>
  <T.MeshStandardMaterial />
</T.Mesh>
```

- **Fields:** each field gets the copy rules (`mapSize: [2048, 2048]` copies into the `Vector2`, `color: 'red'` into the `Color`), and a nested object literal is a Partial value of its own. Fields the literal leaves out keep their values.
- **Attached later:** a Partial value is written again whenever Attach puts a new object in its property, so `material={{ opacity: 0.5 }}` on a `Mesh` reaches the material a child attaches after it, and the one a `<Show>` swaps in. A property that is `null` is skipped until something is attached to it.
- **Missing fields:** a field the current object doesn't have is skipped, never added: before its child attaches, a `Mesh` holds a `MeshBasicMaterial`, which has no `emissive`.
- **Not a Partial value:** an instance of a class is assigned or copied as usual (`material={shared}`, `position={new Vector3()}`), and a property that holds an object literal itself, like `userData`, is replaced as a whole.
- **Types:** `PartialValue<O>` types the fields from the property's declared type, so `position={{ w: 1 }}` and `position={{ y: '1' }}` are type errors, at any depth. A `Mesh`'s `material` is declared as a `Material`, so `material={{ opacity }}` types but `material={{ color }}` doesn't; type the class with its material to get it: `sceneComponent(Mesh<BoxGeometry, MeshStandardMaterial>)`.

## Cameras

A camera's Scene component (`T.PerspectiveCamera`, `T.OrthographicCamera`, or `sceneComponent` of any class whose Instances have `isCamera`) takes `active` too. While it's `true`, the camera is its Canvas's Active camera, which Frames draw with:

```tsx
<T.PerspectiveCamera active={view() === 'close'} position={[0, 1, 3]} fov={40} />
<T.OrthographicCamera active={view() === 'map'} args={[-1, 1, 10, -10]} position={[0, 20, 0]} />
```

- **A stack:** the camera made active most recently wins. When it's deactivated or disposed, the one active before it is the Active camera again, and the default camera once none is.
- **Fitted to the canvas:** while it's the Active camera, its aspect ratio (or an orthographic camera's `left` and `right`, keeping `top`, `bottom` and the center) follows the canvas size, and its projection matrix is updated before each Frame (see [Canvas](../canvas/canvas.md)).
- **Rebuild:** a camera that rebuilds stays active, in its place in the stack.
- **Frames:** activating and deactivating Invalidate the Canvas.
- **Other classes:** `active` is a camera prop only. On any other Instance it is an Instance prop like the rest.

## Pointer events

A Scene component of an `Object3D` takes pointer event handlers: `onClick`, `onContextMenu`, `onPointerDown`, `onPointerUp`, `onPointerMove`, `onPointerOver`, `onPointerOut`, `onPointerEnter`, `onPointerLeave` and `onWheel`. An Instance with at least one is an Interactive Instance.

```tsx
const [hovered, setHovered] = createSignal(false);

<T.Mesh
  onClick={(event) => {
    event.stopPropagation();
    console.log(event.intersection.point);
  }}
  onPointerEnter={() => setHovered(true)}
  onPointerLeave={() => setHovered(false)}
  scale={hovered() ? 1.2 : 1}
>
  <T.BoxGeometry />
  <T.MeshStandardMaterial color={hovered() ? 'hotpink' : 'orange'} />
</T.Mesh>;
```

- **Hit-testing:** on each pointer event over the `<canvas>`, a ray is cast from the Active camera through the pointer, against Interactive Instances and everything under them, where their props now put them. Nothing else is hit-tested: an object with no handlers neither receives events nor blocks them. A hit on an object with no handlers goes to the nearest Interactive Instance above it. Nothing is hit-tested between pointer events, so an object that moves under a still pointer is noticed on the next one.
- **Delivery:** every hit gets the event, nearest first. Each goes to the hit's Interactive Instance, then up through its Interactive ancestors, and then on to the next hit. Each Instance gets an event once, with its nearest hit. `stopPropagation()` ends delivery entirely: no ancestor and no farther hit gets it.
- **Hover:** each move computes the hovered Instances: the ones the move reached, up to the one that stopped it. `onPointerEnter` and `onPointerLeave` run on each Instance that joins or leaves that set, and don't bubble. `onPointerOver` and `onPointerOut` run when the nearest hovered Instance changes, and bubble. The pointer leaving the canvas ends every hover.
- **Capture:** `event.setPointerCapture()` sends that pointer's later moves and its up to this Instance and its Interactive ancestors, hit or not, even outside the canvas, until the pointer is lifted or cancelled or `event.releasePointerCapture()` is called. While captured, those handlers get an event with no `intersection` when the ray misses, and hover doesn't change. Use it for drags.
- **Handlers:** which handlers a component has is read once, and each is read when its event is delivered, so it can change. They aren't written to the Instance. A Rebuild keeps the component interactive. A disposed Instance stops receiving events.
- **DOM:** `event.nativeEvent` is the DOM event on the `<canvas>`, so `event.nativeEvent.preventDefault()` stops a context menu or a page scroll.

The event is a `ScenePointerEvent<E, I>`:

| Member                                                          | Description                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nativeEvent`                                                   | The DOM event: a `PointerEvent`, a `MouseEvent` for `onClick` and `onContextMenu`, a `WheelEvent` for `onWheel`.                                                                                                                                                                       |
| `intersection`                                                  | three's `Intersection` for the nearest hit that led here (`point`, `distance`, `face`, `uv`, `object`: what the ray hit). `undefined` only for `onPointerMove` and `onPointerUp` under a capture that misses, and for `onPointerOut` and `onPointerLeave` once the Instance isn't hit. |
| `object`                                                        | The Instance whose handler is running.                                                                                                                                                                                                                                                 |
| `pointer`                                                       | The pointer in normalized device coordinates (-1 to 1, y up).                                                                                                                                                                                                                          |
| `ray`, `camera`                                                 | The ray cast, and the Active camera it was cast from.                                                                                                                                                                                                                                  |
| `pointerId`                                                     | The DOM event's `pointerId`; `undefined` for a wheel event.                                                                                                                                                                                                                            |
| `button`, `buttons`, `altKey`, `ctrlKey`, `metaKey`, `shiftKey` | Copied from the DOM event.                                                                                                                                                                                                                                                             |
| `stopPropagation()`                                             | Ends delivery.                                                                                                                                                                                                                                                                         |
| `setPointerCapture()`, `releasePointerCapture()`                | Start and end a capture by this Instance. Do nothing without a `pointerId`.                                                                                                                                                                                                            |

## Props

| Prop                          | Type                                 | Default              | Description                                                    |
| ----------------------------- | ------------------------------------ | -------------------- | -------------------------------------------------------------- |
| `args`                        | the constructor's parameters         | `[]`                 | Constructor arguments of the Instance. A change rebuilds it.   |
| `object`                      | an instance of the class             | —                    | An existing Instance to adopt instead. Never disposed.         |
| `attach`                      | `Attach` (`string \| AttachFn`)      | by the Instance type | Where the Instance goes in its parent. Read once.              |
| `dispose`                     | `boolean`                            | `true`               | `false` keeps the Instance after the component is gone.        |
| `ref`                         | `SceneRef<Instance>`                 | —                    | Receives the Instance once attached, and after each Rebuild.   |
| `children`                    | `JSX.Element`                        | —                    | Scene components that attach to this Instance.                 |
| `active`                      | `boolean`                            | `false`              | Cameras only: makes it the Active camera while `true`.         |
| `onClick`, `onPointerDown`, … | `(event: ScenePointerEvent) => void` | —                    | `Object3D`s only: pointer event handlers (see Pointer events). |

Types: `SceneClass` (a constructible class), `InstanceProps<Instance>` (the Instance props), `PartialValue<O>` (a Partial value for an `O`), `PropValue<V>` (what one of them accepts), `SceneComponent<C>` (what `sceneComponent(C)` returns), `SceneComponentProps<Instance, Args>`, `SceneRef<Instance>`, `CameraProps` (a camera's `active`), `PointerEventProps` (an `Object3D`'s handlers), `ScenePointerEvent<E, I>`, `Attach`, `AttachFn` (`(parent, self) => detach`).
