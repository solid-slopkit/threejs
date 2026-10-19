import { createSignal, For } from 'solid-js';
import { Stack, Text } from '@solid-slopkit/components';
import { Canvas, T } from '@solid-slopkit/threejs';

const COLORS = ['tomato', 'gold', 'mediumseagreen', 'royalblue', 'orchid'];

export default function Pointer() {
  const [selected, setSelected] = createSignal<number>();
  const [hovered, setHovered] = createSignal<number>();
  const [point, setPoint] = createSignal('');
  return (
    <Stack gap={3} style={{ width: '100%' }}>
      <Text size="sm">{point() || 'Click a ball.'}</Text>
      <div class="docs-scene">
        <Canvas camera={{ position: [0, 0, 4.5] }}>
          <T.AmbientLight intensity={0.6} />
          <T.DirectionalLight position={[3, 5, 4]} intensity={2} />
          <For each={COLORS}>
            {(color, index) => (
              <T.Mesh
                position={[(index() - 2) * 1.3, 0, 0]}
                scale={selected() === index() ? 1.3 : 1}
                onPointerEnter={() => setHovered(index())}
                onPointerLeave={() => setHovered(undefined)}
                onClick={(event) => {
                  setSelected(index());
                  const { x, y, z } = event.intersection.point;
                  setPoint(`Hit ${color} at (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
                }}
              >
                <T.SphereGeometry args={[0.5, 32, 16]} />
                <T.MeshStandardMaterial color={color} emissive={hovered() === index() ? '#333333' : '#000000'} />
              </T.Mesh>
            )}
          </For>
        </Canvas>
      </div>
    </Stack>
  );
}
