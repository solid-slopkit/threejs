import { render } from '@solidjs/testing-library';
import { captureArtifact } from '@solidjs/diagnostics';
import type { JSX } from '@solidjs/web';
import { createSignal, flush, Show } from 'solid-js';
import { Mesh, OrthographicCamera, PerspectiveCamera, type Camera } from 'three';
import { describe, expect, onTestFinished, test, vi } from 'vitest';
import { resize, stubFactory } from '../../test/harness';
import { sceneComponent } from '../scene-component';
import { Canvas, useCanvas, type CanvasHandle } from '.';

const T = {
  Mesh: sceneComponent(Mesh),
  PerspectiveCamera: sceneComponent(PerspectiveCamera),
  OrthographicCamera: sceneComponent(OrthographicCamera),
};

// Frames render only through advance(), so each one's camera is read from the stub's draws.
function mount(scene: () => JSX.Element = () => null) {
  const { factory, made } = stubFactory();
  let handle!: CanvasHandle;
  const Probe = () => {
    handle = useCanvas();
    return null;
  };
  const utils = render(() => (
    <Canvas renderer={factory} frameloop="never">
      <Probe />
      {scene()}
    </Canvas>
  ));
  flush();
  const canvas = utils.container.querySelector('canvas')!;
  /** Renders a Frame and returns the camera it was drawn with. */
  const drawn = (): Camera => {
    handle.advance();
    return made[0]!.draws.at(-1)!.camera;
  };
  return { ...utils, handle, canvas, drawn };
}

describe('Active camera', () => {
  test('is the default camera while no camera is active, with its aspect following the canvas', () => {
    const { handle, canvas, drawn } = mount();
    expect(handle.activeCamera()).toBe(handle.camera);
    resize(canvas, 200, 100);
    flush();
    expect(drawn()).toBe(handle.camera);
    expect(handle.camera.aspect).toBe(2);
  });

  test('a camera with active draws the Frames, and activeCamera() follows it', () => {
    let camera!: PerspectiveCamera;
    const [active, setActive] = createSignal(true);
    const { handle, canvas, drawn } = mount(() => <T.PerspectiveCamera ref={camera} active={active()} />);
    resize(canvas, 300, 100);
    flush();
    expect(drawn()).toBe(camera);
    expect(handle.activeCamera()).toBe(camera);
    expect(camera.aspect).toBe(3);

    setActive(false);
    flush();
    expect(drawn()).toBe(handle.camera);
    expect(handle.activeCamera()).toBe(handle.camera);
  });

  test('the most recently activated wins, and the one before it returns when it goes', () => {
    let first!: PerspectiveCamera;
    let second!: PerspectiveCamera;
    const [firstActive, setFirstActive] = createSignal(true);
    const [secondShown, setSecondShown] = createSignal(true);
    const { handle, drawn } = mount(() => (
      <>
        <T.PerspectiveCamera ref={first} active={firstActive()} />
        <Show when={secondShown()}>
          <T.PerspectiveCamera ref={second} active />
        </Show>
      </>
    ));
    expect(drawn()).toBe(second);

    // Activated again: the first is now the most recent.
    setFirstActive(false);
    flush();
    setFirstActive(true);
    flush();
    expect(drawn()).toBe(first);

    setFirstActive(false);
    flush();
    expect(drawn()).toBe(second);

    setSecondShown(false);
    flush();
    expect(drawn()).toBe(handle.camera);
    setFirstActive(true);
    flush();
    expect(drawn()).toBe(first);
  });

  test('a Rebuild keeps the camera active, in its place in the stack', () => {
    const cameras: PerspectiveCamera[] = [];
    const [fov, setFov] = createSignal(50);
    const [secondActive, setSecondActive] = createSignal(true);
    let second!: PerspectiveCamera;
    const { drawn } = mount(() => (
      <>
        <T.PerspectiveCamera ref={(camera) => cameras.push(camera)} args={[fov()]} active />
        <T.PerspectiveCamera ref={second} active={secondActive()} />
      </>
    ));
    setFov(60);
    flush();
    expect(cameras).toHaveLength(2);
    expect(drawn()).toBe(second);
    setSecondActive(false);
    flush();
    expect(drawn()).toBe(cameras[1]);
  });

  test('an orthographic camera keeps its height and center, and gets its width from the aspect ratio', () => {
    let camera!: OrthographicCamera;
    const { canvas, drawn } = mount(() => <T.OrthographicCamera ref={camera} args={[-1, 1, 5, -5]} active />);
    resize(canvas, 800, 400);
    flush();
    drawn();
    expect([camera.left, camera.right, camera.top, camera.bottom]).toEqual([-10, 10, 5, -5]);
    resize(canvas, 400, 400);
    flush();
    drawn();
    expect([camera.left, camera.right, camera.top, camera.bottom]).toEqual([-5, 5, 5, -5]);
  });

  test('an inactive camera is left alone', () => {
    let camera!: PerspectiveCamera;
    const { canvas, drawn } = mount(() => <T.PerspectiveCamera ref={camera} args={[50, 1]} />);
    resize(canvas, 300, 100);
    flush();
    drawn();
    expect(camera.aspect).toBe(1);
  });

  test('props on the Active camera reach its projection, without updateProjectionMatrix', () => {
    let camera!: PerspectiveCamera;
    const [fov, setFov] = createSignal(50);
    const { canvas, drawn } = mount(() => <T.PerspectiveCamera ref={camera} fov={fov()} active />);
    resize(canvas, 100, 100);
    flush();
    setFov(30);
    flush();
    drawn();
    expect(camera.projectionMatrix.toArray()).toEqual(new PerspectiveCamera(30, 1).projectionMatrix.toArray());
  });

  test('activating and deactivating a camera Invalidates the Canvas', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const { factory, made } = stubFactory();
    const [active, setActive] = createSignal(false);
    let camera!: PerspectiveCamera;
    render(() => (
      <Canvas renderer={factory}>
        <T.PerspectiveCamera ref={camera} active={active()} />
      </Canvas>
    ));
    flush();
    vi.advanceTimersToNextFrame();
    const draws = made[0]!.draws;
    expect(draws).toHaveLength(1);

    setActive(true);
    flush();
    vi.advanceTimersToNextFrame();
    expect(draws).toHaveLength(2);
    expect(draws[1]!.camera).toBe(camera);

    setActive(false);
    flush();
    vi.advanceTimersToNextFrame();
    expect(draws).toHaveLength(3);
    expect(draws[2]!.camera).not.toBe(camera);
  });

  test('active is a camera prop: other Instances get it as a plain property', () => {
    class Switch {
      active = false;
    }
    const SwitchComponent = sceneComponent(Switch);
    let made!: Switch;
    mount(() => <SwitchComponent ref={made} attach={() => () => {}} active />);
    expect(made.active).toBe(true);
    // @ts-expect-error: a Mesh is not a camera.
    void (() => <T.Mesh active />);
  });

  test('switching cameras causes no diagnostics', async () => {
    const [active, setActive] = createSignal(false);
    const { drawn } = mount(() => <T.PerspectiveCamera active={active()} />);
    const { artifact } = await captureArtifact(
      async () => {
        setActive(true);
        flush();
        drawn();
        await Promise.resolve();
      },
      { scenario: 'switch camera' },
    );
    expect(artifact).toHaveNoDiagnostics({ allow: ['HOT_SCOPE_TIME'] });
    expect(artifact).toStayWithinRerunBudget(0, { scope: /^PerspectiveCamera\.(?!active$)/ });
  });
});
