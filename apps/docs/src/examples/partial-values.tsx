import { createSignal } from 'solid-js';
import { Button, Group, Stack } from '@solid-slopkit/components';
import { Canvas, T } from '@solid-slopkit/threejs';

export default function PartialValues() {
  const [lifted, setLifted] = createSignal(false);
  const [faded, setFaded] = createSignal(false);
  return (
    <Stack gap={3} style={{ width: '100%' }}>
      <Group gap={2}>
        <Button size="sm" color="primary" variant={lifted() ? 'solid' : 'outline'} onClick={() => setLifted(!lifted())}>
          Lift
        </Button>
        <Button size="sm" color="primary" variant={faded() ? 'solid' : 'outline'} onClick={() => setFaded(!faded())}>
          Fade
        </Button>
      </Group>
      <div class="docs-scene">
        <Canvas camera={{ position: [0, 0.3, 5] }}>
          <T.AmbientLight intensity={0.6} />
          <T.DirectionalLight position={[3, 5, 2]} intensity={2} />
          <T.Group position={[-1, 0, 0]}>
            {/* Writes only y, and only the material's opacity and transparent: every other field keeps its value. */}
            <T.Mesh position={{ y: lifted() ? 1.2 : 0 }} material={{ opacity: faded() ? 0.3 : 1, transparent: true }}>
              <T.SphereGeometry args={[0.7, 32, 16]} />
              <T.MeshStandardMaterial color="teal" />
            </T.Mesh>
          </T.Group>
          <T.Mesh position={[1.2, 0, 0]} rotation={{ y: lifted() ? Math.PI / 4 : 0 }}>
            <T.BoxGeometry />
            <T.MeshStandardMaterial color="orange" />
          </T.Mesh>
        </Canvas>
      </div>
    </Stack>
  );
}
