# `three` is a peer; heavy parts of it live behind subpaths

`@solid-slopkit/threejs` has no runtime dependencies of its own. `solid-js`, `@solidjs/web` and `three` are required peer dependencies, so the app installs one copy of each and the Scene components create Instances of the same classes the app imports. `@types/three` is an optional peer, for TypeScript consumers.

Parts of three.js that only one feature needs live behind their own subpath export: the WebGPU renderer (`three/webgpu`) in `@solid-slopkit/threejs/webgpu`, and camera controls (from `three/examples/jsm`) in `@solid-slopkit/threejs/controls`. An app that only draws with WebGL never bundles them.

## Consequences

- Every subpath must be importable on its own, and the main entry must never import from one. A test checks that only the WebGPU subpath imports `three/webgpu`.
- The `three` peer range starts at the first release where `three` and `three/webgpu` share their classes (r171), so the WebGPU opt-in attaches the same Instances.
