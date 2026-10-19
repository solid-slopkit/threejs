import { render } from '@solidjs/testing-library';
import { captureArtifact } from '@solidjs/diagnostics';
import type { JSX } from '@solidjs/web';
import { createSignal, flush, Show } from 'solid-js';
import { PerspectiveCamera } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubFactory } from '../../test/harness';
import { Canvas, sceneComponent, useCanvas, type CanvasHandle } from '..';
import { OrbitControls } from '.';

const T = { PerspectiveCamera: sceneComponent(PerspectiveCamera) };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
});
afterEach(() => {
  vi.useRealTimers();
});

function frame() {
  vi.advanceTimersToNextFrame();
}

function mount(scene: () => JSX.Element) {
  const { factory, made } = stubFactory();
  let handle!: CanvasHandle;
  const Probe = () => {
    handle = useCanvas();
    return null;
  };
  const utils = render(() => (
    <Canvas renderer={factory}>
      <Probe />
      {scene()}
    </Canvas>
  ));
  flush();
  frame();
  const draws = () => made[0]?.draws.length ?? 0;
  /** Runs animation frames until the Canvas stops rendering, and returns how many rendered. */
  const settle = (limit = 500) => {
    const before = draws();
    for (let i = 0; i < limit; i++) {
      const count = draws();
      frame();
      if (draws() === count) return draws() - before;
    }
    throw new Error('The Canvas never settled');
  };
  return { ...utils, handle, draws, settle, canvas: utils.container.querySelector('canvas')! };
}

describe('OrbitControls', () => {
  test('steers the Active camera from the <canvas>, with its props applied and a ref to it', () => {
    let controls!: OrbitControlsImpl;
    const { handle, canvas } = mount(() => (
      <OrbitControls ref={(made) => (controls = made)} target={[0, 1, 0]} minDistance={2} />
    ));
    expect(controls.object).toBe(handle.camera);
    expect(controls.domElement).toBe(canvas);
    expect(controls.target.toArray()).toEqual([0, 1, 0]);
    expect(controls.minDistance).toBe(2);
    // update() ran with the new target: the camera looks at it.
    const forward = handle.camera.getWorldDirection(handle.camera.position.clone());
    expect(forward.y).toBeGreaterThan(0);
  });

  test('a prop change takes effect and renders a Frame', () => {
    const [y, setY] = createSignal(0);
    let controls!: OrbitControlsImpl;
    const { draws } = mount(() => <OrbitControls ref={(made) => (controls = made)} target={[0, y(), 0]} />);
    const before = draws();
    setY(2);
    flush();
    frame();
    expect(controls.target.y).toBe(2);
    expect(draws()).toBe(before + 1);
  });

  test('a camera move Invalidates the Canvas and calls onChange; start and end reach their handlers', () => {
    const log: string[] = [];
    let controls!: OrbitControlsImpl;
    const { draws } = mount(() => (
      <OrbitControls
        ref={(made) => (controls = made)}
        onChange={() => log.push('change')}
        onStart={() => log.push('start')}
        onEnd={() => log.push('end')}
      />
    ));
    const before = draws();
    controls.dispatchEvent({ type: 'start' });
    controls.dispatchEvent({ type: 'change' });
    controls.dispatchEvent({ type: 'end' });
    frame();
    expect(log).toEqual(['start', 'change', 'end']);
    expect(draws()).toBe(before + 1);
  });

  test('without damping, a gesture renders only when the camera moves', () => {
    let controls!: OrbitControlsImpl;
    const { settle } = mount(() => <OrbitControls ref={(made) => (controls = made)} />);
    controls.dispatchEvent({ type: 'start' });
    expect(settle()).toBe(0);
  });

  test('with damping, renders every frame while the camera eases out, then goes back to on demand', () => {
    let controls!: OrbitControlsImpl;
    const { handle, settle } = mount(() => <OrbitControls ref={(made) => (controls = made)} enableDamping />);
    const start = handle.camera.position.clone();
    controls.dispatchEvent({ type: 'start' });
    // What a drag leaves for update() to ease out.
    (controls as unknown as { _sphericalDelta: { theta: number } })._sphericalDelta.theta = 0.5;
    controls.dispatchEvent({ type: 'end' });
    const eased = settle();
    expect(eased).toBeGreaterThan(10);
    expect(handle.camera.position.distanceTo(start)).toBeGreaterThan(0.1);
    expect(settle()).toBe(0);
  });

  test('auto-rotation renders continuously while it is on', () => {
    const [rotating, setRotating] = createSignal(true);
    let controls!: OrbitControlsImpl;
    const { draws, settle } = mount(() => <OrbitControls ref={(made) => (controls = made)} autoRotate={rotating()} />);
    const before = draws();
    frame();
    frame();
    frame();
    expect(draws()).toBe(before + 3);
    void controls;

    setRotating(false);
    flush();
    settle();
    expect(settle()).toBe(0);
  });

  test('follows the Active camera', () => {
    const [active, setActive] = createSignal(false);
    let controls!: OrbitControlsImpl;
    let camera!: PerspectiveCamera;
    const { handle } = mount(() => (
      <>
        <T.PerspectiveCamera ref={camera} active={active()} position={[3, 0, 0]} />
        <OrbitControls ref={(made) => (controls = made)} />
      </>
    ));
    setActive(true);
    flush();
    expect(controls.object).toBe(camera);
    setActive(false);
    flush();
    expect(controls.object).toBe(handle.camera);
  });

  test('is disposed with its owner, and stops rendering', () => {
    const [shown, setShown] = createSignal(true);
    let controls!: OrbitControlsImpl;
    const { settle } = mount(() => (
      <Show when={shown()}>
        <OrbitControls ref={(made) => (controls = made)} autoRotate />
      </Show>
    ));
    const dispose = vi.spyOn(controls, 'dispose');
    setShown(false);
    flush();
    expect(dispose).toHaveBeenCalledOnce();
    settle();
    expect(settle()).toBe(0);
  });

  test('a camera move runs no reactive code', async () => {
    let controls!: OrbitControlsImpl;
    mount(() => <OrbitControls ref={(made) => (controls = made)} target={[0, 0, 0]} />);
    const { artifact } = await captureArtifact(
      async () => {
        controls.dispatchEvent({ type: 'change' });
        frame();
        await Promise.resolve();
      },
      { scenario: 'orbit' },
    );
    expect(artifact).toHaveNoDiagnostics({ allow: ['HOT_SCOPE_TIME'] });
    expect(artifact).toStayWithinRerunBudget(0);
  });
});

describe('the controls subpath', () => {
  test('is never imported by the main entry', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const src = join(dirname(fileURLToPath(import.meta.url)), '..');
    const importers = readdirSync(src, { recursive: true, encoding: 'utf8' })
      .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.startsWith('controls'))
      .filter((path) => /from ['"](\.\.?\/)+controls['"]|examples\/jsm\/controls/.test(readFileSync(join(src, path), 'utf8')));
    expect(importers).toEqual([]);
  });
});
