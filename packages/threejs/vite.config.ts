import { defineConfig } from 'vitest/config';
import solid from '@solidjs/vite-plugin';
import { playwright } from '@vitest/browser-playwright';

// The package ships uncompiled Solid source (see `build:source`); this config only serves the tests.

// The GPU backend for the browser tests: Metal on a Mac, and on Linux (the GPU-less release runner) SwiftShader, a
// software Vulkan that gives both WebGL and WebGPU an adapter.
const gpuArgs =
  process.platform === 'darwin'
    ? ['--use-angle=metal']
    : process.platform === 'linux'
      ? ['--use-angle=vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--enable-unsafe-swiftshader']
      : [];
export default defineConfig({
  plugins: [solid({ ssr: true })],
  test: {
    projects: [
      {
        // The scene graph and reactivity against a stub renderer: fast, no GPU and no layout.
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
          exclude: ['**/*.browser.test.*'],
          setupFiles: ['./test/setup.ts', './test/jsdom-setup.ts'],
          // An SSR test's first render starts the helper's own Vite server (test/ssr.tsx), once per test file.
          testTimeout: 20_000,
        },
      },
      {
        // Anything that needs a GPU context, real layout or real pointer input.
        extends: true,
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.{ts,tsx}', 'test/**/*.browser.test.{ts,tsx}'],
          setupFiles: ['./test/setup.ts'],
          browser: {
            enabled: true,
            // A real WebGPU adapter for the WebGPU tests: headless Chromium offers none by default, and the renderer
            // would quietly fall back to WebGL 2.
            provider: playwright({
              launchOptions: { args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', ...gpuArgs] },
            }),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
