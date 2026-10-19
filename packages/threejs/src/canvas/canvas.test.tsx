import { render } from '@solidjs/testing-library';
import { captureArtifact } from '@solidjs/diagnostics';
import { createRoot, createSignal, Errored, flush } from 'solid-js';
import { PerspectiveCamera, Scene } from 'three';
import { describe, expect, onTestFinished, test, vi } from 'vitest';
import { deferredFactory, resize, stubFactory } from '../../test/harness';
import { Canvas, useCanvas, type CanvasHandle, type DefaultCameraOptions } from '.';

// Captures the handle the way any Scene component gets it: from inside the Canvas. Frames render only through
// advance(), so draws are counted exactly (frame-loop.test.tsx covers the loop).
function mount(props: { renderer?: Parameters<typeof Canvas>[0]['renderer']; camera?: DefaultCameraOptions } = {}) {
  let handle!: CanvasHandle;
  const Probe = () => {
    handle = useCanvas();
    return null;
  };
  const utils = render(() => (
    <Canvas aria-label="Scene" class="scene" renderer={props.renderer} camera={props.camera} frameloop="never">
      <Probe />
    </Canvas>
  ));
  flush();
  const canvas = utils.container.querySelector('canvas')!;
  return { ...utils, canvas, handle };
}

describe('Canvas', () => {
  test('renders a <canvas> that fills its parent, with the attributes passed to it', () => {
    const { canvas, container } = mount({ renderer: stubFactory().factory });
    expect(container.children).toHaveLength(1);
    expect(canvas).toHaveAttribute('aria-label', 'Scene');
    expect(canvas).toHaveClass('scene');
    expect(canvas.style.display).toBe('block');
    expect(canvas.style.width).toBe('100%');
    expect(canvas.style.height).toBe('100%');
  });

  test('merges the style passed to it over its own', () => {
    const { container } = render(() => <Canvas renderer={stubFactory().factory} style={{ height: '50%', outline: 'none' }} />);
    const canvas = container.querySelector('canvas')!;
    expect(canvas.style.height).toBe('50%');
    expect(canvas.style.width).toBe('100%');
    expect(canvas.style.outline).toBe('none');
  });

  test('gives the components inside it the scene and a default PerspectiveCamera', () => {
    const { handle } = mount({ renderer: stubFactory().factory });
    expect(handle.scene).toBeInstanceOf(Scene);
    expect(handle.camera).toBeInstanceOf(PerspectiveCamera);
    expect(handle.camera.fov).toBe(75);
    expect(handle.camera.near).toBe(0.1);
    expect(handle.camera.far).toBe(1000);
    expect(handle.camera.position.toArray()).toEqual([0, 0, 5]);
  });

  test('configures the default camera from the camera prop, and follows its changes', () => {
    const [camera, setCamera] = createSignal<DefaultCameraOptions>({ fov: 50, position: [1, 2, 3] });
    let handle!: CanvasHandle;
    const Probe = () => {
      handle = useCanvas();
      return null;
    };
    render(() => (
      <Canvas renderer={stubFactory().factory} camera={camera()}>
        <Probe />
      </Canvas>
    ));
    flush();
    expect(handle.camera.fov).toBe(50);
    expect(handle.camera.position.toArray()).toEqual([1, 2, 3]);
    const projection = handle.camera.projectionMatrix.clone();

    setCamera({ fov: 30, near: 1, far: 10 });
    flush();
    expect(handle.camera.fov).toBe(30);
    expect(handle.camera.near).toBe(1);
    expect(handle.camera.far).toBe(10);
    expect(handle.camera.position.toArray()).toEqual([0, 0, 5]);
    expect(handle.camera.projectionMatrix.equals(projection)).toBe(false);
  });

  test('throws in useCanvas() outside a Canvas', () => {
    createRoot((dispose) => {
      expect(() => useCanvas()).toThrow();
      dispose();
    });
  });
});

describe('Canvas renderer', () => {
  test('calls the factory once, with its <canvas>, and sets the pixel ratio', () => {
    const { factory, made } = stubFactory();
    const { canvas, handle } = mount({ renderer: factory });
    expect(made).toHaveLength(1);
    expect(made[0]!.canvas).toBe(canvas);
    expect(made[0]!.pixelRatio).toBe(window.devicePixelRatio);
    expect(handle.renderer()).toBe(made[0]);
  });

  test("sizes the renderer to the <canvas>, leaving the element's style alone", () => {
    const { factory, made } = stubFactory();
    const { canvas, handle } = mount({ renderer: factory });
    expect(handle.size()).toEqual({ width: 0, height: 0 });

    expect(resize(canvas, 300, 150)).toBe(1);
    flush();
    expect(handle.size()).toEqual({ width: 300, height: 150 });
    expect(made[0]!.sizes.at(-1)).toEqual([300, 150, false]);

    // The same size again is not a change.
    const calls = made[0]!.sizes.length;
    resize(canvas, 300, 150);
    flush();
    expect(made[0]!.sizes).toHaveLength(calls);
  });

  test('advance() renders one Frame of the scene with the default camera', () => {
    const { factory, made } = stubFactory();
    const { handle } = mount({ renderer: factory });
    expect(handle.advance()).toBe(true);
    expect(made[0]!.draws).toEqual([{ scene: handle.scene, camera: handle.camera }]);
  });

  test('renders no Frame before an async factory resolves', async () => {
    const deferred = deferredFactory();
    const { canvas, handle } = mount({ renderer: deferred.factory });
    resize(canvas, 200, 100);
    flush();
    expect(handle.renderer()).toBeUndefined();
    expect(handle.advance()).toBe(false);

    await deferred.resolve();
    flush();
    const stub = deferred.made[0]!;
    expect(handle.renderer()).toBe(stub);
    // The size measured while waiting reaches the renderer once it arrives.
    expect(stub.sizes.at(-1)).toEqual([200, 100, false]);
    expect(handle.advance()).toBe(true);
    expect(stub.draws).toHaveLength(1);
  });

  test('defaults to a WebGLRenderer', () => {
    // jsdom can't create a WebGL context, so the default renderer's constructor throws; that is enough to show the
    // Canvas reached for it. Drawing with it is covered by canvas.browser.test.tsx.
    const errors: unknown[] = [];
    const jsdomNoise = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => jsdomNoise.mockRestore());
    render(() => (
      <Errored fallback={(error) => (errors.push(error()), null)}>
        <Canvas />
      </Errored>
    ));
    flush();
    expect(String(errors[0])).toMatch(/WebGL/i);
  });
});

describe('Canvas disposal', () => {
  test('disposes the renderer, frees its context and stops observing the size with its owner', () => {
    const { factory, made } = stubFactory();
    const { canvas, unmount } = mount({ renderer: factory });
    unmount();
    expect(made[0]!.disposed).toBe(true);
    expect(made[0]!.contextLost).toBe(true);
    expect(resize(canvas, 10, 10)).toBe(0);
  });

  test('disposes a renderer that resolves after the Canvas is gone, without drawing with it', async () => {
    const deferred = deferredFactory();
    const { handle, unmount } = mount({ renderer: deferred.factory });
    unmount();
    await deferred.resolve();
    flush();
    expect(deferred.made[0]!.disposed).toBe(true);
    expect(handle.advance()).toBe(false);
  });
});

describe('Canvas diagnostics', () => {
  test("mounting, resizing and a camera change raise no diagnostics, and a resize re-runs only the renderer's size binding", async () => {
    const [camera, setCamera] = createSignal<DefaultCameraOptions>({ fov: 50 });
    const { factory } = stubFactory();
    let canvas!: HTMLCanvasElement;
    const mounted = await captureArtifact(
      async () => {
        const utils = render(() => <Canvas renderer={factory} camera={camera()} />);
        flush();
        canvas = utils.container.querySelector('canvas')!;
        setCamera({ fov: 40 });
        flush();
        await Promise.resolve();
      },
      { scenario: 'canvas-mount' },
    );
    expect(mounted.artifact).toHaveNoDiagnostics({ allow: ['HOT_SCOPE_TIME'] });

    const resized = await captureArtifact(
      async () => {
        resize(canvas, 640, 480);
        flush();
        await Promise.resolve();
      },
      { scenario: 'canvas-resize' },
    );
    expect(resized.artifact).toHaveNoDiagnostics({ allow: ['HOT_SCOPE_TIME'] });
    // The one re-run is `Canvas.rendererSize`; the camera binding stays put.
    expect(resized.artifact).toStayWithinRerunBudget(0, { scope: /Canvas\.camera/ });
    expect(resized.artifact).toStayWithinRerunBudget(1);
  });
});
