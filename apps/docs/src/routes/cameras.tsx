import { Title } from '@solidjs/meta';
import { Example } from '../components/Example';
import { H2 } from '../components/Heading';

import Cameras from '../examples/cameras';
import camerasCode from '../examples/cameras.tsx?raw';

export default function ThreejsCameras() {
  return (
    <article class="docs-page">
      <Title>Cameras and controls · threejs · slopkit</Title>
      <p class="docs-eyebrow">threejs</p>
      <h1>Cameras and controls</h1>
      <p class="docs-lead">
        A Canvas draws with its Active camera: the default camera, or the camera most recently made active that still is.
      </p>

      <H2 id="default-camera">The default camera</H2>
      <p>
        Every Canvas has a <code>PerspectiveCamera</code>, set from its <code>camera</code> prop: <code>fov</code> (75),{' '}
        <code>near</code> (0.1), <code>far</code> (1000) and <code>position</code> (<code>[0, 0, 5]</code>). It's{' '}
        <code>useCanvas().camera</code>.
      </p>

      <H2 id="active">Active cameras</H2>
      <p>
        Camera components take <code>active</code>. While it's true, the camera is the Canvas's Active camera. The one made active
        most recently wins; when it's deactivated or disposed, the one before it returns, and the default camera once none is
        left. Switch the view, and drag to orbit:
      </p>
      <Example component={Cameras} code={camerasCode} />
      <ul>
        <li>
          Before each Frame, the Active camera is fitted to the canvas: a perspective camera gets its aspect ratio, and an
          orthographic camera keeps its top, bottom and center and gets its width from the aspect ratio.
        </li>
        <li>
          Its projection matrix is updated before each Frame too, so <code>fov</code>, <code>zoom</code> and <code>near</code>{' '}
          props show without calling <code>updateProjectionMatrix()</code>.
        </li>
        <li>
          <code>useCanvas().activeCamera()</code> is the Active camera, as a signal.
        </li>
      </ul>

      <H2 id="orbit-controls">Orbit controls</H2>
      <p>
        <code>&lt;OrbitControls&gt;</code>, from <code>@solid-slopkit/threejs/controls</code>, orbits the Active camera: drag to
        orbit, turn the wheel to zoom, right-drag to pan. Every property of three's <code>OrbitControls</code> but{' '}
        <code>domElement</code> is a prop (<code>{'target={[0, 1, 0]}'}</code>, <code>enableDamping</code>,{' '}
        <code>minDistance</code>, <code>autoRotate</code>…); the camera is always the Active camera. <code>onChange</code> reports
        a camera move, <code>onStart</code> and <code>onEnd</code> a gesture starting and ending (with damping, the camera keeps
        easing after it ends), and <code>ref</code> gets the controls once they are set up.
      </p>
      <ul>
        <li>
          Each camera move Invalidates, so an on-demand Canvas redraws while you drag and goes idle when you stop. With damping,
          Frames keep coming only while the camera eases to rest, and with <code>autoRotate</code> for as long as it turns.
        </li>
        <li>When another camera becomes active, the same controls move to it, keeping their target.</li>
        <li>They're disposed with their owner.</li>
      </ul>
    </article>
  );
}
