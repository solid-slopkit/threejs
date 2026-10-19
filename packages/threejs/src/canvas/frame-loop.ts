/**
 * When a Canvas renders Frames on its own:
 * - `"demand"`: on the animation frame after something Invalidates it. Any number of Invalidations before that frame
 *   render one Frame. While a Frame callback is registered, on every animation frame.
 * - `"always"`: on every animation frame.
 * - `"never"`: never; only `advance()` renders. Invalidations wait until the mode changes.
 */
export type Frameloop = 'demand' | 'always' | 'never';

export interface FrameLoop {
  /** Asks for a Frame. */
  invalidate(): void;
  /** Renders continuously (outside `"never"`) until the returned release is called. Holds are counted. */
  hold(): () => void;
  setMode(mode: Frameloop): void;
  /** The renderer has arrived: Frames can render from now on. */
  ready(): void;
  /** A Frame was just rendered outside the loop (`advance()`), so a pending Invalidation is met. */
  rendered(): void;
  dispose(): void;
}

/**
 * Schedules Frames on animation frames. `render` draws one Frame, given the seconds since the previous animation
 * frame that rendered one: 0 when the loop was idle in between, so a scene that starts animating doesn't jump.
 */
export function createFrameLoop(render: (delta: number) => void, initial: Frameloop): FrameLoop {
  let mode = initial;
  let ready = false;
  let pending = false;
  let disposed = false;
  let held = 0;
  let frame: number | undefined;
  // The timestamp of the last animation frame that rendered, while the loop keeps running.
  let previous: number | undefined;

  const cancel = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    previous = undefined;
  };
  const continuous = () => mode === 'always' || (mode === 'demand' && held > 0);
  const request = () => {
    if (frame !== undefined || !ready || disposed) return;
    if (continuous() || (mode === 'demand' && pending)) frame = requestAnimationFrame(tick);
    else previous = undefined;
  };
  const tick = (timestamp: number) => {
    frame = undefined;
    // On demand, `advance()` may have met the Invalidation since this frame was requested.
    if (continuous() || pending) {
      pending = false;
      const delta = previous === undefined ? 0 : (timestamp - previous) / 1000;
      previous = timestamp;
      render(delta);
    }
    request();
  };

  return {
    invalidate() {
      pending = true;
      request();
    },
    hold() {
      held++;
      request();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        held--;
      };
    },
    setMode(next) {
      mode = next;
      if (mode === 'never') cancel();
      request();
    },
    ready() {
      ready = true;
      request();
    },
    rendered() {
      pending = false;
    },
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
