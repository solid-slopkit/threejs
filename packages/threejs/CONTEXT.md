# threejs

`@solid-slopkit/threejs` describes three.js scenes with Solid components, so a scene updates through fine-grained reactivity instead of imperative code.

## Language

**Canvas**:
The root of a scene: the `<canvas>` element, the renderer, the scene and the **Frame** loop. Every **Instance** belongs to exactly one Canvas.
_Avoid_: root, viewport, stage

**Active camera**:
The camera a **Canvas** draws with: its default camera, or the camera most recently made active that is still active.
_Avoid_: main camera, default camera (except for the one the Canvas creates)

**Scene component**:
A component that wraps one three.js class and manages its **Instance**: every member of the `T` namespace, and any component made with `sceneComponent(Class)`. The **Canvas** is not one.
_Avoid_: three component, instance component, element, primitive

**Instance**:
The three.js object a component creates and manages (a `Mesh`, a `BoxGeometry`, a `MeshStandardMaterial`).
_Avoid_: object, node, element

**Args**:
The constructor arguments of an **Instance**, given as the `args` prop.
_Avoid_: params, constructor props

**Partial value**:
An object literal given for a property of an **Instance** that holds an object: it sets only the fields it lists, at any depth (`position={{ y: 1 }}`, `shadow={{ mapSize: [2048, 2048] }}`).
_Avoid_: path prop, dashed prop, pierced prop, patch

**Attach**:
Joining an **Instance** to its parent: added as a child if it is an `Object3D`, otherwise assigned to one of the parent's properties. Detaching restores what was there before.
_Avoid_: mount, append, insert

**Owned Instance**:
An **Instance** the component constructed from its **Args**. The component disposes it on **Rebuild** and when its owner is disposed.
_Avoid_: managed instance, internal instance

**Adopted Instance**:
An existing **Instance** handed to a component through its `object` prop. The component attaches and detaches it but never disposes it; a new `object` takes the old one's place as in a **Rebuild**.
_Avoid_: primitive, external instance, borrowed instance

**Asset**:
A resource loaded from a URL through a three.js loader (a model, a texture, an environment map). Shared by every component that asks for the same loader and URL, and shown as an **Adopted Instance**.
_Avoid_: resource, file, model (when meaning any asset)

**Asset cache**:
The shared store of loaded **Assets**. It owns their disposal and disposes an Asset once no reactive owner has used it for a short grace period.
_Avoid_: loader cache, preload cache

**Interactive Instance**:
An **Instance** with at least one pointer event handler. Only Interactive Instances are hit-tested.
_Avoid_: clickable, hoverable, event target

**Frame**:
One render of the scene. By default the **Canvas** renders a Frame only when something asks for one.
_Avoid_: tick, render (as a noun)

**Invalidate**:
Asking the **Canvas** for a **Frame**. Prop writes, **Attach**, detach and **Rebuild** do it on their own; changes made to an **Instance** outside props must do it explicitly.
_Avoid_: request render, dirty, refresh

**Frame callback**:
Code that runs before every **Frame**. While at least one is registered, the **Canvas** renders continuously.
_Avoid_: tick handler, animation callback, update hook

**Render callback**:
Code that replaces the **Canvas**'s default draw of a **Frame** (for example a post-processing chain). A Canvas has at most one.
_Avoid_: render override, custom renderer

**Rebuild**:
Replacing a component's **Instance** with a new one because its **Args** changed, while keeping the component, its children and their state.
_Avoid_: remount, recreate, re-render

### Agent docs

**Skill**:
A task-oriented guide for coding agents (`skills/<area>/SKILL.md`), shipped in the package.
_Avoid_: guide, recipe

**LLM reference**:
Handwritten Markdown for agents next to the source, shipped in the package: one page per area. `llms.md` is the package's index.
_Avoid_: llms.txt (that is only the index), API docs
