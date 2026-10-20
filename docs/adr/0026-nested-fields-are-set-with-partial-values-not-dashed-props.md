# Nested fields are set with Partial values, not dashed props

A Scene component sets one field of the object in a property with a Partial value: an object literal for that property, `position={{ y: 1 }}` or `shadow={{ mapSize: [2048, 2048], camera: { far: 50 } }}`. It writes only the fields it lists, with the usual copy rules, at any depth. We chose it because TypeScript checks the keys of an object literal, so a misspelled field is a compile error at every level, and there is no naming scheme to learn or resolve.

## Considered Options

- **Dashed props** (`position-y`, `material-opacity`), first built in T1.04: rejected. TypeScript never checks a JSX attribute with a dash it doesn't know (that is how `data-*` passes), so `position-w` got through the types and could only throw at runtime. It also stopped at one level, so `shadow.camera.far` still needed a ref.
- **camelCase props** (`positionY`, `materialOpacity`): rejected. They are type-checked, and a scan of the 91 scene-graph classes in three r186 found no name that collides with a real property or splits two ways. But splitting them means looking up properties at runtime, and a future three.js property could collide.

## Consequences

- An instance of a class is never a Partial value: `material={shared}` assigns and `position={new Vector3()}` copies, as before. A property that itself holds an object literal (`userData`) is replaced as a whole.
- A field the current object doesn't have is skipped rather than reported. The object may be a stand-in until Attach fills the property (a Mesh holds a `MeshBasicMaterial` until its child material attaches), and the types already catch misspellings.
- One small object is allocated per change, the same as the array form `position={[0, y(), 0]}`.
