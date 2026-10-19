import { render } from '@solidjs/testing-library';
import { captureArtifact } from '@solidjs/diagnostics';
import type { JSX } from '@solidjs/web';
import { createRoot, createSignal, flush, Show } from 'solid-js';
import { Mesh } from 'three';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubFactory } from '../../test/harness';
import { sceneComponent } from '../scene-component';
import { Canvas, onFrame, useCanvas, type CanvasHandle, type FrameCallback, type Frameloop } from '.';

const T = { Mesh: sceneComponent(Mesh) };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
});
afterEach(() => {
  vi.useRealTimers();
});

/** Runs the next animation frame, 16 ms after the previous one. */
function frame() {
  vi.advanceTimersToNextFrame();
}

/** A component that registers `callback` as a Frame callback. */
function OnFrame(props: { callback: FrameCallback; children?: JSX.Element }) {
  // oxlint-disable-next-line solid/reactivity -- the callback is registered once, like any onFrame call
  onFrame(props.callback);
  return <>{props.children}</>;
}

function mount(scene: () => JSX.Element = () => null, initial: Frameloop = 'demand') {
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
  return { ...utils, handle, draws, setFrameloop };
}

describe('onFrame', () => {
  test('runs each callback before every Frame, in registration order, a parent before its children', () => {
    const calls: string[] = [];
    const { factory, made } = stubFactory();
    const log = (name: string) => () => calls.push(`${name} before draw ${made[0]!.draws.length}`);
    render(() => (
      <Canvas renderer={factory}>
        <OnFrame callback={log('parent')}>
          <OnFrame callback={log('child')} />
        </OnFrame>
      </Canvas>
    ));
    flush();
    frame();
    frame();
    expect(calls).toEqual(['parent before draw 0', 'child before draw 0', 'parent before draw 1', 'child before draw 1']);
  });

  test('passes the Canvas and the seconds since the previous Frame, 0 on the first', () => {
    const seen: Array<[CanvasHandle, number, number]> = [];
    const { handle } = mount(() => <OnFrame callback={(canvas, delta) => seen.push([canvas, delta, canvas.time])} />);
    frame();
    frame();
    expect(seen.map(([canvas]) => canvas)).toEqual([handle, handle, handle]);
    expect(seen.map(([, delta]) => delta)).toEqual([0, 0.016, 0.016]);
    expect(seen.at(-1)![2]).toBeCloseTo(0.032);
  });

  test('renders on every animation frame while registered, and on demand again after the last one goes', () => {
    const [first, setFirst] = createSignal(true);
    const [second, setSecond] = createSignal(true);
    const { draws } = mount(() => (
      <>
        <Show when={first()}>
          <OnFrame callback={() => {}} />
        </Show>
        <Show when={second()}>
          <OnFrame callback={() => {}} />
        </Show>
      </>
    ));
    frame();
    frame();
    expect(draws()).toBe(3);

    setFirst(false);
    flush();
    frame();
    frame();
    // Unmounting Invalidates nothing here, so only the remaining callback keeps Frames coming.
    expect(draws()).toBe(5);

    setSecond(false);
    flush();
    frame();
    const settled = draws();
    frame();
    frame();
    expect(draws()).toBe(settled);
  });

  test('stops running a callback once its owner is disposed', () => {
    const [shown, setShown] = createSignal(true);
    const callback = vi.fn();
    mount(() => (
      <Show when={shown()}>
        <OnFrame callback={callback} />
      </Show>
    ));
    const runs = callback.mock.calls.length;
    setShown(false);
    flush();
    frame();
    frame();
    expect(callback).toHaveBeenCalledTimes(runs);
  });

  test('a delta restarts at 0 after the loop was idle', () => {
    const [shown, setShown] = createSignal(false);
    const deltas: number[] = [];
    mount(() => (
      <Show when={shown()}>
        <OnFrame callback={(_, delta) => deltas.push(delta)} />
      </Show>
    ));
    frame();
    frame();
    setShown(true);
    flush();
    frame();
    frame();
    expect(deltas).toEqual([0, 0.016]);
  });

  test('advance(delta) runs the callbacks with exactly that delta, and adds it to the Frame time', () => {
    const deltas: number[] = [];
    const { handle, draws } = mount(() => <OnFrame callback={(_, delta) => deltas.push(delta)} />, 'never');
    expect(handle.advance(0.5)).toBe(true);
    expect(handle.advance(0.25)).toBe(true);
    expect(handle.advance()).toBe(true);
    expect(deltas).toEqual([0.5, 0.25, 0]);
    expect(handle.time).toBe(0.75);
    expect(draws()).toBe(3);
  });

  test('under "never", a callback renders nothing on its own', () => {
    const callback = vi.fn();
    const { draws } = mount(() => <OnFrame callback={callback} />, 'never');
    frame();
    frame();
    expect(draws()).toBe(0);
    expect(callback).not.toHaveBeenCalled();
  });

  test('runs nothing before the renderer arrives', () => {
    const callback = vi.fn();
    let handle!: CanvasHandle;
    render(() => (
      <Canvas renderer={() => new Promise(() => {})}>
        <OnFrame callback={callback}>
          {(() => {
            handle = useCanvas();
            return null;
          })()}
        </OnFrame>
      </Canvas>
    ));
    flush();
    frame();
    expect(handle.advance(1)).toBe(false);
    expect(callback).not.toHaveBeenCalled();
    expect(handle.time).toBe(0);
  });

  test('a callback registered during a Frame runs from the next one', () => {
    const calls: string[] = [];
    const [late, setLate] = createSignal(false);
    const { handle } = mount(
      () => (
        <>
          <OnFrame
            callback={() => {
              calls.push('early');
              if (!late()) {
                setLate(true);
                flush();
              }
            }}
          />
          <Show when={late()}>
            <OnFrame callback={() => calls.push('late')} />
          </Show>
        </>
      ),
      'never',
    );
    handle.advance();
    handle.advance();
    expect(calls).toEqual(['early', 'early', 'late']);
  });

  test('throws outside a Canvas', () => {
    expect(() => createRoot(() => onFrame(() => {}))).toThrow();
  });
});

describe('Frame callback diagnostics', () => {
  test('a running callback that moves an Instance causes no reactive re-runs', async () => {
    let mesh!: Mesh;
    const { draws } = mount(() => (
      <T.Mesh ref={mesh}>
        <OnFrame callback={(_, delta) => (mesh.rotation.y += delta)} />
      </T.Mesh>
    ));
    const before = draws();
    const { artifact } = await captureArtifact(
      async () => {
        frame();
        frame();
        frame();
        await Promise.resolve();
      },
      { scenario: 'frame callback' },
    );
    expect(draws()).toBe(before + 3);
    expect(mesh.rotation.y).toBeCloseTo(0.048);
    expect(artifact).toHaveNoDiagnostics({ allow: ['HOT_SCOPE_TIME'] });
    expect(artifact).toStayWithinRerunBudget(0);
  });
});
