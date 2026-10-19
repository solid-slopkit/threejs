import { describe, expect, test } from 'vitest';

import * as threejs from './index';

// The public runtime surface, pinned: adding or removing an export is a deliberate change.
const PUBLIC_API = [
  'Canvas',
  'T',
  'configureLoader',
  'invalidate',
  'loadAsset',
  'onFrame',
  'onRender',
  'preloadAsset',
  'sceneComponent',
  'useCanvas',
];

describe('public API', () => {
  test('exports exactly the pinned names', () => {
    expect(Object.keys(threejs).sort()).toEqual(PUBLIC_API);
  });
});
