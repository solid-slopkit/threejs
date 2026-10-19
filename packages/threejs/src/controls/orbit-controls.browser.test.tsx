import { render } from '@solidjs/testing-library';
import { flush } from 'solid-js';
import { expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Canvas, useCanvas, type CanvasHandle } from '..';
import { OrbitControls } from '.';

// A real drag, from the canvas's center to a spot beside it: the controls capture the pointer, orbit the camera, and
// each move renders a Frame of the on-demand Canvas.
test('dragging across the canvas orbits the camera and renders Frames', async () => {
  let handle!: CanvasHandle;
  const Probe = () => {
    handle = useCanvas();
    return null;
  };
  const { container } = render(() => (
    <div style={{ display: 'flex' }}>
      <div style={{ width: '200px', height: '200px' }}>
        <Canvas>
          <Probe />
          <OrbitControls />
        </Canvas>
      </div>
      <div data-testid="beside" style={{ width: '100px', height: '200px' }} />
    </div>
  ));
  flush();
  await expect.poll(() => handle.renderer()).toBeDefined();
  const render$ = vi.spyOn(handle.renderer()!, 'render');
  const start = handle.camera.position.clone();

  await userEvent.dragAndDrop(container.querySelector('canvas')!, container.querySelector('[data-testid="beside"]')!);
  await expect.poll(() => render$.mock.calls.length).toBeGreaterThan(0);
  expect(handle.camera.position.distanceTo(start)).toBeGreaterThan(0.5);
  // Still five units from the target: an orbit, not a zoom.
  expect(handle.camera.position.length()).toBeCloseTo(5, 3);
});
