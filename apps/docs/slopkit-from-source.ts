import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const librarySource = fileURLToPath(new URL('../../packages/threejs/src/index.ts', import.meta.url));
const controlsSource = fileURLToPath(new URL('../../packages/threejs/src/controls/index.ts', import.meta.url));
const webgpuSource = fileURLToPath(new URL('../../packages/threejs/src/webgpu/index.ts', import.meta.url));

// In dev, @solid-slopkit/threejs resolves to the package source, so edits show up without a build.
// @solid-slopkit/components comes from npm like in any app.
export function slopkitFromSource(): Plugin {
  return {
    name: 'slopkit-from-source',
    apply: 'serve',
    enforce: 'pre',
    resolveId(id) {
      if (id === '@solid-slopkit/threejs') return librarySource;
      if (id === '@solid-slopkit/threejs/controls') return controlsSource;
      if (id === '@solid-slopkit/threejs/webgpu') return webgpuSource;
    },
  };
}
