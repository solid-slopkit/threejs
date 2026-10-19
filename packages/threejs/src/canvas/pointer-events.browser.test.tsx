import { render } from '@solidjs/testing-library';
import type { JSX } from '@solidjs/web';
import { createSignal, flush, omit, Show } from 'solid-js';
import { BoxGeometry, Group, Mesh, SphereGeometry } from 'three';
import { describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { sceneComponent } from '../scene-component';
import { Canvas, useCanvas, type CanvasHandle, type PointerEventProps, type ScenePointerEvent } from '.';

const T = { Mesh: sceneComponent(Mesh), Group: sceneComponent(Group), BoxGeometry: sceneComponent(BoxGeometry) };

// A real 200 × 200 canvas and its layout, with the default camera at z = 5 looking down -z. Frames render through
// advance() only; the first one fits the camera to the canvas.
async function mount(scene: () => JSX.Element) {
  let handle!: CanvasHandle;
  const Probe = () => {
    handle = useCanvas();
    return null;
  };
  const utils = render(() => (
    <div style={{ width: '200px', height: '200px' }}>
      <Canvas frameloop="never">
        <Probe />
        {scene()}
      </Canvas>
    </div>
  ));
  flush();
  await expect.poll(() => handle.size()).toEqual({ width: 200, height: 200 });
  flush();
  handle.advance();
  const canvas = utils.container.querySelector('canvas')!;

  /** Dispatches a DOM event at a point given in normalized device coordinates (-1 to 1, y up). */
  const fire = (type: string, [x, y]: [number, number] = [0, 0], init: PointerEventInit = {}) => {
    const rect = canvas.getBoundingClientRect();
    const position = {
      clientX: rect.left + ((x + 1) / 2) * rect.width,
      clientY: rect.top + ((1 - y) / 2) * rect.height,
      bubbles: true,
      pointerId: 1,
      ...init,
    };
    const event = type === 'wheel' ? new WheelEvent(type, position) : new PointerEvent(type, position);
    canvas.dispatchEvent(event);
  };
  return { ...utils, handle, canvas, fire };
}

/** A unit box at `z`. */
function Box(props: { z?: number; children?: JSX.Element } & PointerEventProps & { ref?: (mesh: Mesh) => void }) {
  const others = omit(props, 'z', 'children');
  return (
    <T.Mesh {...others} position={[0, 0, props.z ?? 0]}>
      <T.BoxGeometry />
      {props.children}
    </T.Mesh>
  );
}

const CORNER: [number, number] = [0.95, 0.95];

describe('pointer events', () => {
  test('a click on an Interactive Instance carries its intersection; a miss calls nothing', async () => {
    const events: ScenePointerEvent<MouseEvent>[] = [];
    let mesh!: Mesh;
    const { fire, handle } = await mount(() => <Box ref={(m: Mesh) => (mesh = m)} onClick={(e) => events.push(e)} />);
    fire('click');
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event!.object).toBe(mesh);
    expect(event!.intersection.object).toBe(mesh);
    expect(event!.intersection.point.z).toBeCloseTo(0.5);
    expect(event!.camera).toBe(handle.camera);
    expect(event!.pointer.toArray()).toEqual([0, 0]);
    expect(event!.nativeEvent.type).toBe('click');

    fire('click', CORNER);
    expect(events).toHaveLength(1);
  });

  test('every hit gets the event, nearest first, each followed by its Interactive ancestors', async () => {
    const log: string[] = [];
    const { fire } = await mount(() => (
      <>
        <T.Group onClick={() => log.push('group')}>
          <Box z={1} onClick={() => log.push('front')} />
        </T.Group>
        <Box z={-1} onClick={() => log.push('back')} />
      </>
    ));
    fire('click');
    expect(log).toEqual(['front', 'group', 'back']);
  });

  test('stopPropagation() ends delivery, for ancestors and farther hits alike', async () => {
    const log: string[] = [];
    const { fire } = await mount(() => (
      <>
        <T.Group onClick={() => log.push('group')}>
          <Box
            z={1}
            onClick={(e) => {
              log.push('front');
              e.stopPropagation();
            }}
          />
        </T.Group>
        <Box z={-1} onClick={() => log.push('back')} />
      </>
    ));
    fire('click');
    expect(log).toEqual(['front']);
  });

  test('only Interactive Instances are hit-tested: other objects neither block nor receive, but bubble to them', async () => {
    const hits: Array<Mesh | undefined> = [];
    let child!: Mesh;
    const { fire } = await mount(() => (
      <>
        {/* No handlers: in front, but not hit-tested. */}
        <Box z={2} />
        <T.Group onClick={(e) => hits.push(e.intersection.object as Mesh)}>
          <Box ref={(m: Mesh) => (child = m)} />
        </T.Group>
      </>
    ));
    fire('click');
    expect(hits).toEqual([child]);
  });

  test('down, up, wheel and context menu reach their handlers', async () => {
    const log: string[] = [];
    const { fire } = await mount(() => (
      <Box
        onPointerDown={() => log.push('down')}
        onPointerUp={() => log.push('up')}
        onWheel={(e) => log.push(`wheel ${e.nativeEvent.deltaY}`)}
        onContextMenu={() => log.push('contextmenu')}
      />
    ));
    fire('pointerdown');
    fire('pointerup');
    fire('wheel', [0, 0], { deltaY: 3 } as WheelEventInit);
    fire('contextmenu');
    expect(log).toEqual(['down', 'up', 'wheel 3', 'contextmenu']);
  });

  test('hovering: Over and Out follow the nearest hovered Instance and bubble; Enter and Leave follow each one', async () => {
    const log: string[] = [];
    const handlers = (name: string) => ({
      onPointerOver: () => log.push(`${name} over`),
      onPointerOut: () => log.push(`${name} out`),
      onPointerEnter: () => log.push(`${name} enter`),
      onPointerLeave: () => log.push(`${name} leave`),
    });
    const { fire } = await mount(() => (
      <T.Group {...handlers('group')}>
        <T.Mesh {...handlers('left')} position={[-1, 0, 0]}>
          <T.BoxGeometry />
        </T.Mesh>
        <T.Mesh {...handlers('right')} position={[1, 0, 0]}>
          <T.BoxGeometry />
        </T.Mesh>
      </T.Group>
    ));
    const left: [number, number] = [-0.3, 0];
    const right: [number, number] = [0.3, 0];

    fire('pointermove', left);
    expect(log.splice(0)).toEqual(['left over', 'group over', 'left enter', 'group enter']);
    fire('pointermove', [-0.31, 0]);
    expect(log.splice(0)).toEqual([]);
    fire('pointermove', right);
    expect(log.splice(0)).toEqual(['left out', 'group out', 'right over', 'group over', 'left leave', 'right enter']);
    fire('pointermove', CORNER);
    expect(log.splice(0)).toEqual(['right out', 'group out', 'right leave', 'group leave']);
    fire('pointermove', left);
    log.splice(0);
    fire('pointerleave', left);
    expect(log.splice(0)).toEqual(['left out', 'group out', 'left leave', 'group leave']);
  });

  test('a stopped move hovers only the Instances it reached', async () => {
    const log: string[] = [];
    const { fire } = await mount(() => (
      <>
        <Box z={1} onPointerMove={(e) => e.stopPropagation()} onPointerEnter={() => log.push('front enter')} />
        <Box z={-1} onPointerEnter={() => log.push('back enter')} />
      </>
    ));
    fire('pointermove');
    expect(log).toEqual(['front enter']);
  });

  test('a captured pointer sends moves and the up to the capturing Instance, hit or not, until it is lifted', async () => {
    const moves: Array<boolean> = [];
    const ups: Array<boolean> = [];
    const { fire } = await mount(() => (
      <Box
        onPointerDown={(e) => e.setPointerCapture()}
        onPointerMove={(e) => moves.push(e.intersection !== undefined)}
        onPointerUp={(e) => ups.push(e.intersection !== undefined)}
      />
    ));
    fire('pointerdown');
    fire('pointermove', [0.05, 0]);
    fire('pointermove', CORNER);
    fire('pointerup', CORNER);
    fire('pointermove', CORNER);
    expect(moves).toEqual([true, false]);
    expect(ups).toEqual([false]);
  });

  test('releasePointerCapture() ends a capture', async () => {
    let moves = 0;
    const { fire } = await mount(() => (
      <Box
        onPointerDown={(e) => e.setPointerCapture()}
        onPointerMove={(e) => {
          moves++;
          e.releasePointerCapture();
        }}
      />
    ));
    fire('pointerdown');
    fire('pointermove', CORNER);
    fire('pointermove', CORNER);
    expect(moves).toBe(1);
  });

  test('handlers are read when their event is delivered, so they can change', async () => {
    const log: string[] = [];
    const [which, setWhich] = createSignal<'first' | 'second'>('first');
    const first = () => log.push('first');
    const second = () => log.push('second');
    const meshes: Mesh[] = [];
    const { fire } = await mount(() => <Box ref={(mesh) => meshes.push(mesh)} onClick={which() === 'first' ? first : second} />);
    fire('click');
    setWhich('second');
    flush();
    fire('click');
    expect(log).toEqual(['first', 'second']);
    // The same Instance throughout: the handler changed in place.
    expect(meshes).toHaveLength(1);
  });

  test('a Rebuild stays interactive, and a disposed Instance stops receiving', async () => {
    const [radius, setRadius] = createSignal(0.5);
    const [shown, setShown] = createSignal(true);
    const Ball = sceneComponent(Mesh);
    const hits: Mesh[] = [];
    const { fire } = await mount(() => (
      <Show when={shown()}>
        <Ball args={[new SphereGeometry(radius())]} onClick={(e) => hits.push(e.object as Mesh)} />
      </Show>
    ));
    fire('click');
    setRadius(0.6);
    flush();
    fire('click');
    expect(hits).toHaveLength(2);
    expect(hits[1]).not.toBe(hits[0]);

    setShown(false);
    flush();
    fire('click');
    expect(hits).toHaveLength(2);
  });

  test('hits the Instance where its props put it, before the next Frame renders', async () => {
    const [x, setX] = createSignal(0);
    let clicks = 0;
    const { fire } = await mount(() => (
      <T.Mesh position={[x(), 0, 0]} onClick={() => clicks++}>
        <T.BoxGeometry />
      </T.Mesh>
    ));
    setX(3);
    flush();
    fire('click');
    expect(clicks).toBe(0);
  });

  test('real pointer input reaches a handler', async () => {
    const log: string[] = [];
    const { canvas } = await mount(() => (
      <Box onPointerDown={() => log.push('down')} onPointerUp={() => log.push('up')} onClick={() => log.push('click')} />
    ));
    await userEvent.click(canvas);
    expect(log).toEqual(['down', 'up', 'click']);
  });
});
