// @vitest-environment node
// The generated `T` namespace: up to date with three, covering the scene-graph classes only, and tree-shakable.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import solid from '@solidjs/vite-plugin';
import { build, type Rolldown } from 'vite';
import { describe, expect, test } from 'vitest';
import { T } from '../src';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

describe('T', () => {
  test('is what the generator writes for the installed three', () => {
    // Fails after a three upgrade until `pnpm generate` is run and the result reviewed.
    expect(() => execFileSync('node', ['scripts/generate-t.mjs', '--check'], { cwd: packageRoot, stdio: 'pipe' })).not.toThrow();
  });

  test('has the scene-graph classes, and no math types, loaders or renderers', () => {
    const names = Object.keys(T);
    expect(names).toEqual(
      expect.arrayContaining([
        'Mesh',
        'Group',
        'PerspectiveCamera',
        'PointLight',
        'BoxGeometry',
        'MeshStandardMaterial',
        'Texture',
        'Fog',
        'AxesHelper',
      ]),
    );
    for (const name of ['Vector3', 'Color', 'Euler', 'TextureLoader', 'WebGLRenderer', 'Light', 'Clock']) {
      expect(names).not.toContain(name);
    }
    expect(T.Mesh.name).toBe('Mesh');
  });

  test('drops every member an app does not use from its production build', { timeout: 60_000 }, async () => {
    const result = (await build({
      root: packageRoot,
      configFile: false,
      logLevel: 'silent',
      plugins: [solid()],
      build: {
        write: false,
        minify: true,
        rolldownOptions: { input: fileURLToPath(new URL('fixtures/one-mesh.tsx', import.meta.url)) },
      },
    })) as Rolldown.RolldownOutput;
    const code = result.output
      .filter((chunk): chunk is Rolldown.OutputChunk => chunk.type === 'chunk')
      .map((chunk) => chunk.code)
      .join('\n');

    // A three class sets `this.type` to its own name, a string that survives minification (in any quotes).
    const hasType = (name: string) => new RegExp(`["'\`]${name}["'\`]`).test(code);
    expect(hasType('BoxGeometry')).toBe(true);
    expect(hasType('MeshBasicMaterial')).toBe(true);
    for (const unused of ['TorusKnotGeometry', 'LatheGeometry', 'SkinnedMesh', 'PolarGridHelper', 'CompressedCubeTexture']) {
      expect(hasType(unused), unused).toBe(false);
    }
  });
});
