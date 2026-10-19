import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import * as webgpu from '.';

const src = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('the webgpu subpath', () => {
  test('exports webgpuRenderer only', () => {
    expect(Object.keys(webgpu)).toEqual(['webgpuRenderer']);
  });

  test('is the only place that imports three/webgpu (ADR 0002)', () => {
    const importers = readdirSync(src, { recursive: true, encoding: 'utf8' })
      .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
      .filter((path) => /from ['"]three\/webgpu['"]/.test(readFileSync(join(src, path), 'utf8')))
      .map((path) => path.split('\\').join('/'));
    expect(importers).toEqual(['webgpu/webgpu.ts']);
  });
});
