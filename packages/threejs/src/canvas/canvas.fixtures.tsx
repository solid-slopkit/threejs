// Scenarios for canvas.ssr.test.tsx, rendered on the server and hydrated by test/ssr.tsx. Both halves run their own
// copies of these modules, so what the test reads afterwards goes through `globalThis.ssrRecord`.
import { isServer } from '@solidjs/web';
import { stubFactory } from '../../test/harness';
import { sceneComponent } from '../scene-component';
import { Canvas, onFrame, useCanvas, type CanvasHandle } from '.';
import { BoxGeometry, Mesh } from 'three';

export interface SsrRecord {
  /** Where the scene's components ran: `"server"` or `"client"`. */
  runs: string[];
  handle?: CanvasHandle;
  mesh?: Mesh;
}

const T = { Mesh: sceneComponent(Mesh), BoxGeometry: sceneComponent(BoxGeometry) };

function record(): SsrRecord {
  const global = globalThis as { ssrRecord?: SsrRecord };
  return (global.ssrRecord ??= { runs: [] });
}

function Scene() {
  const handle = useCanvas();
  record().runs.push(isServer ? 'server' : 'client');
  record().handle = handle;
  onFrame(() => {});
  return (
    <T.Mesh ref={(mesh) => (record().mesh = mesh)} position={[0, 1, 0]}>
      <T.BoxGeometry />
    </T.Mesh>
  );
}

export const withFallback = () => (
  <div class="stage">
    <Canvas
      renderer={stubFactory().factory}
      frameloop="never"
      aria-label="Scene"
      fallback={<p class="poster">Loading the scene</p>}
    >
      <Scene />
    </Canvas>
  </div>
);

export const withoutFallback = () => (
  <div class="stage">
    <Canvas renderer={stubFactory().factory} frameloop="never">
      <Scene />
    </Canvas>
  </div>
);
