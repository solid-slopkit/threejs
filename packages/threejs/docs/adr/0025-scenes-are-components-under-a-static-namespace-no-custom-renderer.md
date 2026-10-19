# Scenes are components under a static namespace, not a custom renderer

`@solid-slopkit/threejs` describes a three.js scene with ordinary Solid components: `<T.Mesh position={[0, 1, 0]}><T.BoxGeometry args={[1, 1, 1]} /></T.Mesh>`. Each component creates its three.js object once, binds each prop to it with its own effect, attaches the object to the parent it gets from context, and detaches it when its owner is disposed. A script generates one component per three.js class, each importing only its own class. They are exposed only as a static module namespace (`export * as T`), which bundlers tree-shake by member, and never as flat named exports. The generated set covers every constructible scene-graph class three.js exports (objects, cameras, lights, geometries, materials, textures, fog, helpers), but not math types, loaders or renderers. A factory, `sceneComponent(Class)`, wraps any class outside that set (add-ons, user subclasses).

## Consequences

- The scene is part of the page's own component tree, so Solid context from outside the `Canvas` reaches every component inside it without bridging.
- Every Instance's props are ordinary Solid bindings, so the reactive diagnostics and rerun attribution work on scenes unchanged.

## Considered Options

- **A custom renderer with lowercase intrinsic tags** (`<mesh>`): rejected. Solid 2 ships no `createRenderer` runtime, so we would write and maintain one. Consumers would also have to compile scene files in the compiler's `universal` or `dynamic` mode, which `@solidjs/vite-plugin` can't select per file or per tag. That breaks the premise of ADR 0001, where the consumer's Solid plugin compiles our JSX with its own settings.
- **A proxy namespace that resolves `THREE[name]` lazily:** rejected, because it needs `import * as THREE from 'three'` at runtime and bundles all of three.js.
- **Flat named exports** (`import { Mesh }`): rejected, because they clash with three's own class names, which scene code imports all the time. Offering both shapes would split every example.
