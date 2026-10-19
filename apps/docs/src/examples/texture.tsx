import { createSignal, Loading } from 'solid-js';
import { Button, Group, Stack } from '@solid-slopkit/components';
import { Canvas, T, loadAsset } from '@solid-slopkit/threejs';
import { TextureLoader } from 'three';
import orange from './checker-orange.png';
import teal from './checker-teal.png';

// Imported, so the files are served under the site's base path.
const textures: Record<string, string> = { orange, teal };

function Crate(props: { pattern: string }) {
  // Follows the URL; while the next texture loads, the current one stays on screen.
  const texture = loadAsset(TextureLoader, () => textures[props.pattern]!);
  return (
    <T.Mesh rotation={[0.5, 0.7, 0]}>
      <T.BoxGeometry args={[1.8, 1.8, 1.8]} />
      <T.MeshStandardMaterial map={texture()} />
    </T.Mesh>
  );
}

export default function Texture() {
  const [pattern, setPattern] = createSignal('orange');
  return (
    <Stack gap={3} style={{ width: '100%' }}>
      <Group gap={2}>
        <Button
          size="sm"
          color="primary"
          variant={pattern() === 'orange' ? 'solid' : 'outline'}
          onClick={() => setPattern('orange')}
        >
          Orange
        </Button>
        <Button size="sm" color="primary" variant={pattern() === 'teal' ? 'solid' : 'outline'} onClick={() => setPattern('teal')}>
          Teal
        </Button>
      </Group>
      <div class="docs-scene">
        <Canvas camera={{ position: [0, 0, 4] }} fallback={<p class="docs-scene-fallback">Loading…</p>}>
          <T.AmbientLight intensity={0.8} />
          <T.DirectionalLight position={[3, 5, 4]} intensity={2} />
          <Loading>
            <Crate pattern={pattern()} />
          </Loading>
        </Canvas>
      </div>
    </Stack>
  );
}
