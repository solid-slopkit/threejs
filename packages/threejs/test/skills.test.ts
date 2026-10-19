// The skills (ADR 0012) are handwritten too. This keeps them in step with the code: each names itself after its
// folder, the llms.md index lists it, and every name it imports from the package exists there.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import * as main from '../src/index';
import * as controls from '../src/controls';
import * as webgpu from '../src/webgpu';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entries: Record<string, object> = {
  '@solid-slopkit/threejs': main,
  '@solid-slopkit/threejs/controls': controls,
  '@solid-slopkit/threejs/webgpu': webgpu,
};
const areas = readdirSync(join(root, 'skills'));
const skill = (area: string) => readFileSync(join(root, 'skills', area, 'SKILL.md'), 'utf8');

describe('skills', () => {
  test('there is one per area the roadmap names', () => {
    expect(areas.sort()).toEqual(['animation', 'assets', 'scenes']);
  });

  test.each(areas)('%s is named after its folder, has a description, and is listed in llms.md', (area) => {
    const front = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(skill(area));
    expect(front?.[1]).toBe(`slopkit-threejs-${area}`);
    expect(front?.[2]!.length).toBeGreaterThan(80);
    expect(readFileSync(join(root, 'src/llms.md'), 'utf8')).toContain(`skills/${area}/SKILL.md`);
  });

  test.each(areas)('%s imports only names the package exports', (area) => {
    const missing: string[] = [];
    for (const [, names, from] of skill(area).matchAll(/import \{([^}]+)\} from '(@solid-slopkit\/threejs[^']*)'/g)) {
      const entry = entries[from!];
      if (!entry) {
        missing.push(from!);
        continue;
      }
      for (const name of names!
        .split(',')
        .map((each) => each.trim())
        .filter(Boolean)) {
        if (!name.startsWith('type ') && !(name in entry)) missing.push(`${name} from ${from}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
