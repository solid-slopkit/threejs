import { render } from '@solidjs/testing-library';
import type { JSX } from '@solidjs/web';
import { createRoot, createSignal, flush, Show } from 'solid-js';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubFactory } from '../../test/harness';
import { Canvas, onFrame, onRender, useCanvas, type CanvasHandle, type Frameloop, type RenderCallback } from '.';

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

/** A component that registers `callback` as its Canvas's Render callback. */
function OnRender(props: { callback: RenderCallback }) {
  // oxlint-disable-next-line solid/reactivity -- the callback is registered once, like any onRender call
  onRender(props.callback);
  return null;
}

function mount(scene: () => JSX.Element = () => null, frameloop: Frameloop = 'demand') {
  const { factory, made } = stubFactory();
  let handle!: CanvasHandle;
  const Probe = () => {
    handle = useCanvas();
    return null;
  };
  const utils = render(() => (
    <Canvas renderer={factory} frameloop={frameloop}>
      <Probe />
      {scene()}
    </Canvas>
  ));
  flush();
  // The first Frame, for the renderer's arrival and the mount.
  frame();
  return { ...utils, handle, draws: () => made[0]?.draws.length ?? 0 };
}

describe('onRender', () => {
  test('draws every Frame in place of the default draw, after the Frame callbacks', () => {
    const calls: string[] = [];
    const seen: Array<[CanvasHandle, number]> = [];
    function Scene() {
      onRender((canvas, delta) => {
        calls.push('render');
        seen.push([canvas, delta]);
      });
      onFrame(() => calls.push('frame'));
      return null;
    }
    const { draws, handle } = mount(() => <Scene />, 'never');
    handle.advance(0.5);
    handle.advance(0.25);
    expect(calls).toEqual(['frame', 'render', 'frame', 'render']);
    expect(seen).toEqual([
      [handle, 0.5],
      [handle, 0.25],
    ]);
    expect(draws()).toBe(0);
  });

  test('the default draw returns once its owner is disposed, and both changes render a Frame', () => {
    const [shown, setShown] = createSignal(false);
    const callback = vi.fn();
    const { draws } = mount(() => (
      <Show when={shown()}>
        <OnRender callback={callback} />
      </Show>
    ));
    expect(draws()).toBe(1);
    setShown(true);
    flush();
    frame();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(draws()).toBe(1);

    setShown(false);
    flush();
    frame();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(draws()).toBe(2);
  });

  test("doesn't render continuously", () => {
    const callback = vi.fn();
    mount(() => <OnRender callback={callback} />);
    const runs = callback.mock.calls.length;
    frame();
    frame();
    expect(callback).toHaveBeenCalledTimes(runs);
  });

  test('a second one on the same Canvas is an error in development', () => {
    expect(() =>
      mount(() => (
        <>
          <OnRender callback={() => {}} />
          <OnRender callback={() => {}} />
        </>
      )),
    ).toThrow('a Canvas has at most one Render callback');
  });

  test('one replacing another under Show is not a second one', () => {
    const [which, setWhich] = createSignal(true);
    const calls: string[] = [];
    const { handle } = mount(
      () => (
        <Show when={which()} fallback={<OnRender callback={() => calls.push('b')} />}>
          <OnRender callback={() => calls.push('a')} />
        </Show>
      ),
      'never',
    );
    handle.advance();
    setWhich(false);
    flush();
    handle.advance();
    setWhich(true);
    flush();
    handle.advance();
    expect(calls).toEqual(['a', 'b', 'a']);
  });

  test('each Canvas has its own', () => {
    const first = vi.fn();
    const second = vi.fn();
    const a = mount(() => <OnRender callback={first} />, 'never');
    const b = mount(() => <OnRender callback={second} />, 'never');
    a.handle.advance();
    b.handle.advance();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  test('throws outside a Canvas', () => {
    expect(() => createRoot(() => onRender(() => {}))).toThrow();
  });
});
