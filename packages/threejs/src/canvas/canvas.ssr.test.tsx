import { afterEach, describe, expect, test } from 'vitest';
import { renderAndHydrate, type HydrationResult } from '../../test/ssr';
import type { SsrRecord } from './canvas.fixtures';

const record = () => (globalThis as { ssrRecord?: SsrRecord }).ssrRecord!;

let result: HydrationResult | undefined;
afterEach(() => {
  result?.dispose();
  result = undefined;
  delete (globalThis as { ssrRecord?: SsrRecord }).ssrRecord;
});

function expectClean(hydrated: HydrationResult) {
  expect(hydrated.serverMessages, 'console messages and errors during the server render').toEqual([]);
  expect(hydrated.clientMessages, 'console messages and errors during hydration').toEqual([]);
  expect(
    hydrated.replaced.map((element) => element.outerHTML.slice(0, 80)),
    'server-rendered elements that hydration replaced',
  ).toEqual([]);
}

describe('Canvas on the server and through hydration', () => {
  test('the server renders the <canvas> and the fallback, never the scene', async () => {
    result = await renderAndHydrate('./canvas.fixtures.tsx', 'withFallback');
    expect(result.html).toMatch(/<canvas[^>]*aria-label="Scene"/);
    expect(result.html).toContain('Loading the scene');
    expect(record().runs[0]).toBe('client');
    expect(record().runs).not.toContain('server');
    expectClean(result);
  });

  test('hydrates cleanly, then mounts the scene, and the first Frame ends the fallback', async () => {
    result = await renderAndHydrate('./canvas.fixtures.tsx', 'withFallback');
    expectClean(result);
    const { handle, mesh } = record();
    expect(record().runs).toEqual(['client']);
    expect(mesh?.parent).toBe(handle?.scene);
    expect(mesh?.position.y).toBe(1);

    const poster = result.container.querySelector('.poster');
    const canvas = result.container.querySelector('canvas');
    expect(poster).not.toBeNull();
    expect(handle!.advance()).toBe(true);
    result.flush();
    expect(result.container.querySelector('.poster')).toBeNull();
    // The <canvas> the server rendered is the one the scene draws into.
    expect(result.container.querySelector('canvas')).toBe(canvas);
  });

  test('without a fallback, only the <canvas>', async () => {
    result = await renderAndHydrate('./canvas.fixtures.tsx', 'withoutFallback');
    // Hydration keys and markers aside, the stage holds the <canvas> and nothing else.
    const stage = new DOMParser().parseFromString(result.html, 'text/html').querySelector('.stage')!;
    expect([...stage.children].map((child) => child.tagName)).toEqual(['CANVAS']);
    expectClean(result);
    expect(record().runs).toEqual(['client']);
  });
});
