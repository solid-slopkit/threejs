import { render } from '@solidjs/testing-library';
import { captureArtifact } from '@solidjs/diagnostics';
import type { JSX } from '@solidjs/web';
import { createSignal, flush, Show } from 'solid-js';
import { BoxGeometry, Mesh } from 'three';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { deferredFactory, resize, stubFactory } from '../../test/harness';
import { sceneComponent } from '../scene-component';
import { Canvas, invalidate, useCanvas, type CanvasHandle, type Frameloop } from '.';

const T = { Mesh: sceneComponent(Mesh), BoxGeometry: sceneComponent(BoxGeometry) };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
});
afterEach(() => {
  vi.useRealTimers();
});

/** Runs the next animation frame. */
function frame() {
  vi.advanceTimersToNextFrame();
}

function mount(scene: () => JSX.Element = () => null, initial?: Frameloop) {
  const { factory, made } = stubFactory();
  const [frameloop, setFrameloop] = createSignal(initial);
  let handle!: CanvasHandle;
  const Probe = () => {
    handle = useCanvas();
    return null;
  };
  const utils = render(() => (
    <Canvas renderer={factory} frameloop={frameloop()}>
      <Probe />
      {scene()}
    </Canvas>
  ));
  flush();
  const draws = () => made[0]?.draws.length ?? 0;
  // The first Frame, for the renderer's arrival and the mount.
  frame();
  return { ...utils, handle, draws, setFrameloop, canvas: utils.container.querySelector('canvas')! };
}

describe('Frames on demand', () => {
  test('render one Frame once mounted, then nothing while nothing changes', () => {
    const { draws } = mount(() => <T.Mesh />);
    expect(draws()).toBe(1);
    frame();
    frame();
    expect(draws()).toBe(1);
  });

  test('a prop change renders one Frame, however many props change before it', () => {
    const [x, setX] = createSignal(0);
    const { draws } = mount(() => <T.Mesh position={[x(), 0, 0]} scale={x() + 1} visible />);
    setX(1);
    flush();
    setX(2);
    flush();
    expect(draws()).toBe(1);
    frame();
    expect(draws()).toBe(2);
    frame();
    expect(draws()).toBe(2);
  });

  test('Attach, detach and Rebuild each render a Frame', () => {
    const [shown, setShown] = createSignal(true);
    const [width, setWidth] = createSignal(1);
    const { draws } = mount(() => (
      <T.Mesh>
        <Show when={shown()}>
          <T.BoxGeometry args={[width(), 1, 1]} />
        </Show>
      </T.Mesh>
    ));
    setWidth(2);
    flush();
    frame();
    expect(draws()).toBe(2);
    setShown(false);
    flush();
    frame();
    expect(draws()).toBe(3);
    setShown(true);
    flush();
    frame();
    expect(draws()).toBe(4);
  });

  test('a resize and a camera change render a Frame', () => {
    const [fov, setFov] = createSignal(75);
    const { factory, made } = stubFactory();
    const { container } = render(() => <Canvas renderer={factory} camera={{ fov: fov() }} />);
    flush();
    frame();
    const stub = made[0]!;
    resize(container.querySelector('canvas')!, 100, 50);
    flush();
    frame();
    expect(stub.draws).toHaveLength(2);
    setFov(40);
    flush();
    frame();
    expect(stub.draws).toHaveLength(3);
  });

  test('invalidate() on the handle renders a Frame of that Canvas; the exported one, of every Canvas', () => {
    const first = mount();
    const second = mount();
    first.handle.invalidate();
    frame();
    expect([first.draws(), second.draws()]).toEqual([2, 1]);
    invalidate();
    frame();
    expect([first.draws(), second.draws()]).toEqual([3, 2]);
  });

  test('waits for an async renderer, then renders what was asked for meanwhile', async () => {
    const deferred = deferredFactory();
    render(() => (
      <Canvas renderer={deferred.factory}>
        <T.Mesh />
      </Canvas>
    ));
    flush();
    frame();
    await deferred.resolve();
    expect(deferred.made[0]!.draws).toHaveLength(0);
    frame();
    expect(deferred.made[0]!.draws).toHaveLength(1);
  });

  test('advance() meets a pending Invalidation', () => {
    const [x, setX] = createSignal(0);
    const { draws, handle } = mount(() => <T.Mesh position={[x(), 0, 0]} />);
    setX(1);
    flush();
    handle.advance();
    frame();
    expect(draws()).toBe(2);
  });

  test('renders nothing after the Canvas is gone', () => {
    const [x, setX] = createSignal(0);
    const { draws, unmount } = mount(() => <T.Mesh position={[x(), 0, 0]} />);
    setX(1);
    flush();
    unmount();
    frame();
    expect(draws()).toBe(1);
  });
});

describe('frameloop', () => {
  test('"always" renders a Frame on every animation frame', () => {
    const { draws } = mount(undefined, 'always');
    frame();
    frame();
    expect(draws()).toBe(3);
  });

  test('"never" renders only through advance(), and Invalidations wait for another mode', () => {
    const { draws, handle, setFrameloop } = mount(undefined, 'never');
    expect(draws()).toBe(0);
    handle.invalidate();
    frame();
    expect(draws()).toBe(0);
    expect(handle.advance()).toBe(true);
    expect(draws()).toBe(1);

    handle.invalidate();
    setFrameloop('demand');
    flush();
    frame();
    expect(draws()).toBe(2);
  });

  test('switching from "always" to "demand" stops the loop', () => {
    const { draws, setFrameloop } = mount(undefined, 'always');
    setFrameloop('demand');
    flush();
    frame();
    const settled = draws();
    frame();
    frame();
    expect(draws()).toBe(settled);
  });
});

describe('frame loop diagnostics', () => {
  test('Invalidating adds no re-runs to a prop change', async () => {
    const [x, setX] = createSignal(0);
    mount(() => <T.Mesh position={[x(), 0, 0]} scale={2} />);
    const { artifact } = await captureArtifact(
      async () => {
        setX(1);
        flush();
        frame();
        await Promise.resolve();
      },
      { scenario: 'invalidate' },
    );
    expect(artifact).toHaveNoDiagnostics({ allow: ['HOT_SCOPE_TIME'] });
    expect(artifact).toStayWithinRerunBudget(1);
  });
});
