import { Title } from '@solidjs/meta';
import { CodeBlock } from '../components/CodeBlock';
import { DocTable } from '../components/DocTable';
import { Example } from '../components/Example';
import { H2 } from '../components/Heading';
import { withBase } from '../base';

import FirstScene from '../examples/first-scene';
import firstSceneCode from '../examples/first-scene.tsx?raw';

const CANVAS_PROPS: [string, string, string][] = [
  [
    'renderer',
    'a WebGLRenderer with antialiasing',
    'A factory (canvas) => renderer, or a promise of one. Called once, after mount.',
  ],
  [
    'camera',
    '{ fov: 75, near: 0.1, far: 1000, position: [0, 0, 5] }',
    'The default camera. A field left out goes back to its default.',
  ],
  ['frameloop', "'demand'", "When Frames render on their own: 'demand', 'always' or 'never'. Reactive."],
  ['fallback', '—', 'Shown after the <canvas> until the first Frame. Whether there is one is read once.'],
  ['style', '—', 'Merged over display: block and 100% width and height.'],
];

const HANDLE: [string, string][] = [
  ['scene', 'The scene the Canvas renders.'],
  ['camera', 'The default camera.'],
  ['activeCamera()', 'The camera Frames draw with.'],
  ['renderer()', 'The renderer, or undefined until it is ready.'],
  ['size()', "The <canvas> element's size, 0 × 0 until it has been measured."],
  ['time', "Frame time in seconds, the sum of every Frame's delta. A plain number: read it in a Frame callback."],
  ['invalidate()', 'Asks this Canvas for a Frame.'],
  ['advance(delta)', 'Runs the Frame callbacks with delta and renders one Frame now. false until the renderer is ready.'],
];

export default function ThreejsOverview() {
  return (
    <article class="docs-page">
      <Title>threejs · slopkit</Title>
      <p class="docs-eyebrow">threejs</p>
      <h1>Overview</h1>
      <p class="docs-lead">
        <code>@solid-slopkit/threejs</code> describes three.js scenes with SolidJS 2 components. Each component creates its
        three.js Instance once (again only when its <code>args</code> change) and keeps it in sync through fine-grained bindings:
        there is no custom renderer and no re-render.
      </p>

      <H2 id="installation">Installation</H2>
      <p>
        Install <code>@solid-slopkit/threejs</code> from npm, with <code>three</code> and its types.
      </p>
      <CodeBlock lang="bash" code="pnpm add @solid-slopkit/threejs three @types/three" />
      <p>
        It needs <code>solid-js</code> and <code>@solidjs/web</code> 2.x and <code>three</code> r171 or later, which it takes as
        peer dependencies, as it does <code>@types/three</code> for TypeScript.
      </p>

      <H2 id="first-scene">A first scene</H2>
      <p>
        <code>&lt;Canvas&gt;</code> makes the <code>&lt;canvas&gt;</code>, the renderer, the scene and a default camera, and fills
        its parent, so give the parent a size. Inside it, every member of <code>T</code> wraps one three.js class: a mesh, its
        geometry and its material are components nested the way their Instances attach. Hover the box, and drag to orbit.
      </p>
      <Example component={FirstScene} code={firstSceneCode} />
      <p>
        The Canvas renders a <strong>Frame</strong> only when something changes: here, a prop written on hover, or the camera
        moving. An idle scene draws nothing.
      </p>

      <H2 id="canvas">Canvas</H2>
      <p>
        Other props pass through to the <code>&lt;canvas&gt;</code> element. The Canvas disposes the renderer with its owner.
      </p>
      <DocTable
        head={['Prop', 'Default', 'Description']}
        rows={CANVAS_PROPS.map(([prop, fallback, description]) => [<code>{prop}</code>, <code>{fallback}</code>, description])}
      />
      <p>
        <code>useCanvas()</code>, called in the body of a component inside the Canvas, returns its handle. Keep the handle and use
        it from event handlers and Frame callbacks; <code>useCanvas()</code> itself throws outside a component body.
      </p>
      <DocTable
        head={['Member', 'Description']}
        rows={HANDLE.map(([member, description]) => [<code>{member}</code>, description])}
      />

      <H2 id="webgpu">WebGPU</H2>
      <p>
        The default renderer is a <code>WebGLRenderer</code>. To render with WebGPU, pass the factory from the <code>webgpu</code>{' '}
        subpath. <code>webgpuRenderer(parameters)</code> takes the <code>WebGPURenderer</code> parameters except{' '}
        <code>canvas</code>, resolves once the renderer has initialized, and falls back to WebGL 2 where the browser has no
        WebGPU. Scenes don't change, except that <code>ShaderMaterial</code> and <code>RawShaderMaterial</code> need node
        materials instead.
      </p>
      <CodeBlock
        code={`import { Canvas } from '@solid-slopkit/threejs';
import { webgpuRenderer } from '@solid-slopkit/threejs/webgpu';

<Canvas renderer={webgpuRenderer({ antialias: true })}>…</Canvas>`}
      />

      <H2 id="server-rendering">Server rendering</H2>
      <p>
        On the server a Canvas renders only its <code>&lt;canvas&gt;</code> and its <code>fallback</code>. The scene mounts in the
        browser once the page has hydrated, so nothing in it runs on the server. The <code>fallback</code> goes after the{' '}
        <code>&lt;canvas&gt;</code> and stays until the first Frame has rendered; lay it over the canvas with your own CSS. The
        examples on these pages are rendered that way.
      </p>

      <H2 id="for-agents">For coding agents</H2>
      <p>
        The package ships its own docs for agents: task guides at <code>node_modules/@solid-slopkit/threejs/skills/</code> and a
        reference per area, indexed in <code>node_modules/@solid-slopkit/threejs/dist/source/llms.md</code>.
      </p>

      <H2 id="next">Next</H2>
      <ul>
        <li>
          <a href={withBase('/scene-components')}>Scene components</a>: props, Partial values, Attach, Rebuild and Adopted
          Instances.
        </li>
        <li>
          <a href={withBase('/animation')}>Animation</a>, <a href={withBase('/cameras')}>Cameras and controls</a>,{' '}
          <a href={withBase('/pointer-events')}>Pointer events</a>, <a href={withBase('/assets')}>Assets</a>.
        </li>
      </ul>
    </article>
  );
}
