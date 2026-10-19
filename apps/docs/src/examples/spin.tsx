import { createSignal, Show } from 'solid-js';
import { Button, Group, Stack } from '@solid-slopkit/components';
import { Canvas, T, onFrame } from '@solid-slopkit/threejs';
import type { Mesh } from 'three';

// The Frame callback lives in its own component, so it exists only while spinning: the Canvas renders every
// animation frame while it does, and nothing once it's gone.
function Spin(props: { target: () => Mesh }) {
  onFrame((canvas, delta) => {
    const mesh = props.target();
    mesh.rotation.y += delta;
    mesh.rotation.x = Math.sin(canvas.time) * 0.4;
  });
  return null;
}

export default function Spinning() {
  const [spinning, setSpinning] = createSignal(true);
  let knot!: Mesh;
  return (
    <Stack gap={3} style={{ width: '100%' }}>
      <Group gap={2}>
        <Button size="sm" variant="outline" onClick={() => setSpinning(!spinning())}>
          {spinning() ? 'Pause' : 'Spin'}
        </Button>
      </Group>
      <div class="docs-scene">
        <Canvas camera={{ position: [0, 0, 5] }}>
          <T.AmbientLight intensity={0.5} />
          <T.PointLight position={[3, 3, 3]} intensity={40} />
          <T.Mesh ref={knot}>
            <T.TorusKnotGeometry args={[0.9, 0.3, 128, 16]} />
            <T.MeshStandardMaterial color="mediumseagreen" roughness={0.3} />
          </T.Mesh>
          <Show when={spinning()}>
            <Spin target={() => knot} />
          </Show>
        </Canvas>
      </div>
    </Stack>
  );
}
