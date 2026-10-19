import { createSignal } from 'solid-js';
import { Canvas, T } from '@solid-slopkit/threejs';
import { OrbitControls } from '@solid-slopkit/threejs/controls';

export default function FirstScene() {
  const [hovered, setHovered] = createSignal(false);
  return (
    <div class="docs-scene">
      <Canvas camera={{ fov: 50, position: [3, 2, 4] }} fallback={<p class="docs-scene-fallback">Loading the scene…</p>}>
        <T.AmbientLight intensity={0.6} />
        <T.DirectionalLight position={[5, 5, 5]} intensity={2} />
        <T.Mesh scale={hovered() ? 1.2 : 1} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
          <T.BoxGeometry args={[1.5, 1.5, 1.5]} />
          <T.MeshStandardMaterial color={hovered() ? 'hotpink' : 'orange'} roughness={0.4} />
        </T.Mesh>
        <OrbitControls enableDamping />
      </Canvas>
    </div>
  );
}
