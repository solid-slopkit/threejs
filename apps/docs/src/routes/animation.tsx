import { Title } from '@solidjs/meta';
import { CodeBlock } from '../components/CodeBlock';
import { DocTable } from '../components/DocTable';
import { Example } from '../components/Example';
import { H2 } from '../components/Heading';

import Spinning from '../examples/spin';
import spinCode from '../examples/spin.tsx?raw';

const FRAMELOOP: [string, string][] = [
  [
    'demand',
    'The default. A Frame on the animation frame after something Invalidates, and on every one while a Frame callback is registered.',
  ],
  ['always', 'A Frame on every animation frame.'],
  ['never', 'Frames only through useCanvas().advance(delta).'],
];

export default function ThreejsAnimation() {
  return (
    <article class="docs-page">
      <Title>Animation · threejs · slopkit</Title>
      <p class="docs-eyebrow">threejs</p>
      <h1>Animation</h1>
      <p class="docs-lead">
        A Canvas renders a Frame when something asks for one. Animation either asks for Frames continuously, with a Frame
        callback, or changes props from state, which asks for one Frame per change.
      </p>

      <H2 id="frames">Frames and Invalidating</H2>
      <p>
        Prop writes, Attach, detach and Rebuild <strong>Invalidate</strong> the Canvas, and so do a resize and a camera change.
        Any number of Invalidations before the next animation frame render one Frame. A change made to an Instance any other way,
        through a ref or when a texture finishes loading, needs <code>invalidate()</code> on the <code>useCanvas()</code> handle,
        or the exported <code>invalidate()</code>, which asks every Canvas.
      </p>
      <DocTable head={['frameloop', 'Frames render']} rows={FRAMELOOP.map(([mode, meaning]) => [<code>{mode}</code>, meaning])} />

      <H2 id="frame-callbacks">Frame callbacks</H2>
      <p>
        <code>onFrame((canvas, delta) =&gt; …)</code> runs before every Frame, until the calling component's owner is disposed.
        <code>delta</code> is the seconds since the previous Frame (0 on the first Frame after the Canvas was idle), and{' '}
        <code>canvas.time</code> their sum. While one is registered the Canvas renders every animation frame; once the last one is
        gone it's back on demand. Here the callback is in a component under a <code>&lt;Show&gt;</code>, so pausing stops the
        Frames.
      </p>
      <Example component={Spinning} code={spinCode} />
      <ul>
        <li>
          Change Instances directly in a Frame callback, through a ref. That runs no reactive code, and shows in the Frame drawn
          right after. A signal written there reaches its props only after that Frame.
        </li>
        <li>Callbacks run in registration order, so a parent component's runs before its children's.</li>
        <li>
          Multiply speeds by <code>delta</code>, so motion doesn't depend on the frame rate.
        </li>
      </ul>

      <H2 id="state">Changes from state</H2>
      <p>
        For changes driven by events (selected, hovered, toggled), put signals in props:{' '}
        <code>{'scale={selected() ? 1.2 : 1}'}</code>, or a Partial value for one field:{' '}
        <code>{'position={{ y: lifted() ? 1 : 0 }}'}</code>. Each change renders one Frame and nothing in between.
      </p>

      <H2 id="render-callbacks">Render callbacks</H2>
      <p>
        <code>onRender((canvas, delta) =&gt; …)</code> replaces the Canvas's own draw for every Frame, after the Frame callbacks,
        for example to draw through a post-processing chain. A Canvas has at most one; a second one is an error in development. It
        doesn't render continuously by itself.
      </p>
      <CodeBlock
        code={`onRender((canvas, delta) => {
  pass.camera = canvas.activeCamera();
  composer.render(delta);
});`}
      />

      <H2 id="tests">Frames in tests</H2>
      <p>
        With <code>frameloop="never"</code>, nothing renders on its own. <code>useCanvas().advance(0.5)</code> runs the Frame
        callbacks with a <code>delta</code> of 0.5 and renders one Frame, so animations step deterministically. It returns{' '}
        <code>false</code> and does nothing until the renderer is ready. In jsdom, which has no WebGL, pass a stub{' '}
        <code>renderer</code>.
      </p>
    </article>
  );
}
