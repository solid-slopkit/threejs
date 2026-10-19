import { render } from '@solidjs/testing-library';
import { flush } from 'solid-js';
import { Color, type WebGLRenderer } from 'three';
import { expect, test } from 'vitest';
import { Canvas, useCanvas, type CanvasHandle } from '.';

// The default renderer, a real ResizeObserver and a real WebGL context: what jsdom's stub can't show.
test('the default WebGLRenderer fills a sized parent, draws the scene, and loses its context on unmount', async () => {
  let handle!: CanvasHandle;
  const Probe = () => {
    handle = useCanvas();
    return null;
  };
  const { unmount } = render(() => (
    <div style={{ width: '120px', height: '80px' }}>
      <Canvas>
        <Probe />
      </Canvas>
    </div>
  ));
  flush();

  await expect.poll(() => handle.size()).toEqual({ width: 120, height: 80 });
  flush();
  const renderer = handle.renderer() as WebGLRenderer;
  const gl = renderer.getContext();
  expect(gl.drawingBufferWidth).toBe(Math.floor(120 * window.devicePixelRatio));
  expect(gl.drawingBufferHeight).toBe(Math.floor(80 * window.devicePixelRatio));

  handle.scene.background = new Color(0xff0000);
  expect(handle.advance()).toBe(true);
  const pixel = new Uint8Array(4);
  gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  expect([...pixel]).toEqual([255, 0, 0, 255]);

  unmount();
  expect(gl.isContextLost()).toBe(true);
});
