import { Title } from '@solidjs/meta';
import { CodeBlock } from '../components/CodeBlock';
import { Example } from '../components/Example';
import { H2 } from '../components/Heading';

import Texture from '../examples/texture';
import textureCode from '../examples/texture.tsx?raw';

export default function ThreejsAssets() {
  return (
    <article class="docs-page">
      <Title>Assets · threejs · slopkit</Title>
      <p class="docs-eyebrow">threejs</p>
      <h1>Assets</h1>
      <p class="docs-lead">
        An Asset is anything a three.js loader loads from a URL: a model, a texture, an environment map. <code>loadAsset</code>{' '}
        reads one through a cache that loads each one once, shares it, and disposes it when nothing uses it.
      </p>

      <H2 id="load-asset">loadAsset</H2>
      <p>
        <code>loadAsset(Loader, () =&gt; url)</code> returns an accessor typed from the loader: a <code>Texture</code> for{' '}
        <code>TextureLoader</code>, a <code>GLTF</code> for <code>GLTFLoader</code>. Reading it before it has loaded suspends to
        the nearest <code>&lt;Loading&gt;</code>, so put one inside the Canvas. When the URL changes, the old Asset stays on
        screen until the new one is ready. Switch the texture:
      </p>
      <Example component={Texture} code={textureCode} />

      <H2 id="models">Models</H2>
      <p>
        Show a loaded model through the <code>object</code> prop. One object can be in the scene once, so clone it to show it
        twice; clones share the original's geometries and materials.
      </p>
      <CodeBlock
        code={`import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

function Ship() {
  const gltf = loadAsset(GLTFLoader, () => '/models/ship.glb');
  return <T.Group object={gltf().scene} position={[0, 1, 0]} />;
}`}
      />

      <H2 id="cache">The Asset cache</H2>
      <ul>
        <li>The cache is keyed by loader class and URL: every component that asks for one shares one load and one Asset.</li>
        <li>
          Each component reading an Asset uses it. Once nothing has used it for a second, it's disposed: its own{' '}
          <code>dispose()</code>, or the geometries, materials and textures of the scenes it holds. An Asset used again sooner is
          reused.
        </li>
        <li>
          A failed load reaches the nearest <code>&lt;Errored&gt;</code>, and the next read tries again.
        </li>
      </ul>

      <H2 id="preload">Preloading and loader settings</H2>
      <p>
        <code>preloadAsset(Loader, url)</code> starts a load before anything reads it, and keeps the Asset until its first use.{' '}
        <code>configureLoader(Loader, configure, {'{ dispose }'})</code> sets up the one loader the cache makes per class, for
        DRACO or KTX2, and can replace the disposal of its Assets. Call it once at startup, before loading.
      </p>
      <CodeBlock
        code={`import { configureLoader, preloadAsset } from '@solid-slopkit/threejs';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const draco = new DRACOLoader().setDecoderPath('/draco/');
configureLoader(GLTFLoader, (loader) => loader.setDRACOLoader(draco));

void preloadAsset(GLTFLoader, '/models/ship.glb');`}
      />
    </article>
  );
}
