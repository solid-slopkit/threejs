import { createSignal } from 'solid-js';
import { Button, Group, Stack, Text } from '@solid-slopkit/components';
import { Canvas, T } from '@solid-slopkit/threejs';

export default function Rebuild() {
  const [segments, setSegments] = createSignal(6);
  return (
    <Stack gap={3} style={{ width: '100%' }}>
      <Group gap={2}>
        <Button size="sm" variant="outline" onClick={() => setSegments(Math.max(3, segments() - 1))}>
          Fewer sides
        </Button>
        <Button size="sm" variant="outline" onClick={() => setSegments(Math.min(32, segments() + 1))}>
          More sides
        </Button>
        <Text size="sm">{segments()} sides</Text>
      </Group>
      <div class="docs-scene">
        <Canvas camera={{ position: [0, 0.6, 4] }}>
          <T.AmbientLight intensity={0.6} />
          <T.DirectionalLight position={[3, 5, 2]} intensity={2} />
          <T.Mesh rotation={[0.3, 0, 0]}>
            {/* CylinderGeometry takes its sides only in the constructor: a change rebuilds it. */}
            <T.CylinderGeometry args={[1, 1, 1, segments()]} />
            <T.MeshStandardMaterial color="slateblue" flatShading />
          </T.Mesh>
        </Canvas>
      </div>
    </Stack>
  );
}
