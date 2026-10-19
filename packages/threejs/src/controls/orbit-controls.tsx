import { createEffect, onCleanup, untrack } from 'solid-js';
import { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
import { addFrameCallback, canvasElement, useCanvas } from '../canvas/canvas';
import type { InstanceProps } from '../scene-component';
import { bindProps } from '../scene-component/props';

/** The props of `<OrbitControls>`. */
export type OrbitControlsProps = Omit<InstanceProps<OrbitControlsImpl>, 'domElement'> & {
  /** Receives the controls once they are set up. */
  ref?: OrbitControlsImpl | ((controls: OrbitControlsImpl) => void);
  /** The camera moved. */
  onChange?: () => void;
  /** A gesture started: a drag, a wheel turn, a key press. */
  onStart?: () => void;
  /** A gesture ended. With damping, the camera may keep easing for a while after it. */
  onEnd?: () => void;
};

const OWN_PROPS: ReadonlySet<string> = new Set(['onChange', 'onStart', 'onEnd']);

/**
 * Orbit controls for the Active camera of the Canvas it is inside, listening on its `<canvas>`: dragging orbits,
 * the wheel zooms, a right drag pans. Every property of three's `OrbitControls` is a prop. A camera move Invalidates
 * the Canvas, so an on-demand scene redraws while it moves and goes idle once it stops. Disposed with its owner.
 */
export function OrbitControls(props: OrbitControlsProps) {
  const canvas = useCanvas();
  const element = canvasElement(canvas);
  if (!element) throw new Error('@solid-slopkit/threejs: OrbitControls needs its Canvas to be mounted');
  const controls = new OrbitControlsImpl(untrack(canvas.activeCamera), element);

  // While the camera moves by itself (damping easing a gesture out, auto-rotation), `update()` runs before every
  // Frame; once it reports no movement and nothing will move it, the Canvas is back on demand. Without either, every
  // change Invalidates on its own.
  let gesture = false;
  let running: (() => void) | undefined;
  const animates = () => controls.autoRotate || (controls.enableDamping && gesture);
  const run = () => {
    if (running) return;
    running = addFrameCallback(canvas, () => {
      const moved = controls.update();
      if (!moved && !animates()) {
        running?.();
        running = undefined;
      }
    });
  };

  const handlers = props as Pick<OrbitControlsProps, 'onChange' | 'onStart' | 'onEnd'>;
  const onChange = () => {
    canvas.invalidate();
    untrack(() => handlers.onChange)?.();
  };
  const onStart = () => {
    gesture = true;
    if (controls.enableDamping) run();
    untrack(() => handlers.onStart)?.();
  };
  const onEnd = () => {
    gesture = false;
    untrack(() => handlers.onEnd)?.();
  };
  controls.addEventListener('change', onChange);
  controls.addEventListener('start', onStart);
  controls.addEventListener('end', onEnd);

  // A prop write takes effect through update(), which also starts auto-rotation.
  // oxlint-disable-next-line solid/reactivity -- bindProps reads the props inside its own render effects
  bindProps(
    () => controls,
    props,
    'OrbitControls',
    () => {
      controls.update();
      canvas.invalidate();
      if (controls.autoRotate) run();
    },
    OWN_PROPS,
  );

  // The same controls steer whichever camera is active.
  createEffect(
    () => canvas.activeCamera(),
    (camera) => {
      if (controls.object === camera) return;
      controls.object = camera;
      controls.update();
      canvas.invalidate();
    },
    { name: 'OrbitControls.camera', defer: true },
  );

  onCleanup(() => {
    running?.();
    controls.removeEventListener('change', onChange);
    controls.removeEventListener('start', onStart);
    controls.removeEventListener('end', onEnd);
    controls.dispose();
  });

  const ref = untrack(() => props.ref);
  if (typeof ref === 'function') ref(controls);
  return null;
}
