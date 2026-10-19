import { createSignal } from 'solid-js';
import { Button, Group, Stack } from '@solid-slopkit/components';
import { Canvas, T } from '@solid-slopkit/threejs';
import { OrbitControls } from '@solid-slopkit/threejs/controls';

type View = 'default' | 'close' | 'map';

export default function Cameras() {
  const [view, setView] = createSignal<View>('default');
  const choose = (next: View) => (
    <Button size="sm" color="primary" variant={view() === next ? 'solid' : 'outline'} onClick={() => setView(next)}>
      {next}
    </Button>
  );
  return (
    <Stack gap={3} style={{ width: '100%' }}>
      <Group gap={2}>
        {choose('default')}
        {choose('close')}
        {choose('map')}
      </Group>
      <div class="docs-scene">
        <Canvas camera={{ position: [4, 3, 6] }}>
          <T.PerspectiveCamera active={view() === 'close'} position={[0, 0.5, 2.5]} fov={35} />
          <T.OrthographicCamera
            active={view() === 'map'}
            args={[-1, 1, 3, -3]}
            position={[0, 10, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          />
          <T.AmbientLight intensity={0.6} />
          <T.DirectionalLight position={[3, 5, 2]} intensity={2} />
          <T.GridHelper args={[8, 8]} />
          <T.Mesh position={[-1, 0.5, 0]}>
            <T.BoxGeometry />
            <T.MeshStandardMaterial color="orange" />
          </T.Mesh>
          <T.Mesh position={[1, 0.5, 0]}>
            <T.ConeGeometry args={[0.5, 1, 24]} />
            <T.MeshStandardMaterial color="royalblue" />
          </T.Mesh>
          <OrbitControls target={[0, 0.5, 0]} enableDamping />
        </Canvas>
      </div>
    </Stack>
  );
}
