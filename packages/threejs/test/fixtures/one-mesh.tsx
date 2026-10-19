// The app the tree-shaking test builds: one mesh, so everything else in `T` should be dropped.
import { render } from '@solidjs/web';
import { Canvas, T } from '../../src';

render(
  () => (
    <Canvas>
      <T.Mesh>
        <T.BoxGeometry />
        <T.MeshBasicMaterial color="red" />
      </T.Mesh>
    </Canvas>
  ),
  document.body,
);
