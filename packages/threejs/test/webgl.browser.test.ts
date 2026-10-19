// Smoke test for the browser project: headless Chromium gives three.js a working WebGL context that really draws.
// Everything that needs a GPU context builds on this, so when it fails, look here before at the package.
import { Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Scene, WebGLRenderer } from 'three';
import { afterEach, expect, test } from 'vitest';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

test('a WebGLRenderer on a real canvas draws the scene', () => {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const renderer = new WebGLRenderer({ canvas, preserveDrawingBuffer: true });
  cleanups.push(() => {
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  });
  renderer.setSize(16, 16, false);
  renderer.setClearColor(0x000000);

  // A red plane that covers the whole orthographic view.
  const geometry = new PlaneGeometry(2, 2);
  const material = new MeshBasicMaterial({ color: 0xff0000 });
  cleanups.push(() => {
    geometry.dispose();
    material.dispose();
  });
  const scene = new Scene().add(new Mesh(geometry, material));
  renderer.render(scene, new OrthographicCamera(-1, 1, 1, -1, 0, 1));

  const gl = renderer.getContext();
  const pixel = new Uint8Array(4);
  gl.readPixels(8, 8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  expect(gl).toBeInstanceOf(WebGL2RenderingContext);
  expect([...pixel]).toEqual([255, 0, 0, 255]);
});
