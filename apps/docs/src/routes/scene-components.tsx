import { Title } from '@solidjs/meta';
import { CodeBlock } from '../components/CodeBlock';
import { DocTable } from '../components/DocTable';
import { Example } from '../components/Example';
import { H2 } from '../components/Heading';

import PartialValues from '../examples/partial-values';
import partialValuesCode from '../examples/partial-values.tsx?raw';
import Rebuild from '../examples/rebuild';
import rebuildCode from '../examples/rebuild.tsx?raw';

const COPY_RULES: [string, string, string][] = [
  ['anything, for a Color', 'color.set(value)', `color="hotpink", emissive={0x111111}`],
  ['an array', 'set(...value)', 'position={[0, 1, 0]}, rotation={[0, Math.PI, 0]}'],
  ['a number', 'setScalar(value), or set(value)', 'scale={2}, layers={1}'],
  ['an object of the same type', 'copy(value)', 'quaternion={q}'],
  ['undefined', 'nothing', ''],
];

const ATTACH: [string, string][] = [
  ['an Object3D', 'added as a child: parent.add(instance)'],
  ['a BufferGeometry', 'assigned to parent.geometry'],
  ['a Material', 'assigned to parent.material'],
  ['anything else', 'needs attach, or it throws'],
];

export default function ThreejsSceneComponents() {
  return (
    <article class="docs-page">
      <Title>Scene components · threejs · slopkit</Title>
      <p class="docs-eyebrow">threejs</p>
      <h1>Scene components</h1>
      <p class="docs-lead">
        A Scene component wraps one three.js class: it constructs its Instance, keeps it in sync with its props, attaches it to
        its parent, and disposes it with its owner.
      </p>

      <H2 id="t">The T namespace</H2>
      <p>
        <code>T</code> has a component for each scene-graph class three.js exports: objects, cameras, lights, helpers, geometries,
        materials, textures and fog. It's a static namespace, so a bundler keeps only the members you use. For anything else, such
        as an add-on from <code>three/examples</code> or a subclass of your own, make one at module level with{' '}
        <code>sceneComponent</code>.
      </p>
      <CodeBlock
        code={`import { sceneComponent } from '@solid-slopkit/threejs';
import { Water } from 'three/examples/jsm/objects/Water.js';

const WaterSurface = sceneComponent(Water);`}
      />

      <H2 id="props">Props</H2>
      <p>
        Every other prop sets the Instance's property of the same name, and each prop is its own binding, so a change re-runs only
        that write. A property that holds a math object is copied into, never replaced, so code holding <code>mesh.position</code>{' '}
        keeps seeing the current value:
      </p>
      <DocTable
        head={['Value', 'Write', 'Example']}
        rows={COPY_RULES.map(([value, write, example]) => [value, <code>{write}</code>, example ? <code>{example}</code> : ''])}
      />
      <p>Any other value is assigned. The types follow the same rules, so a string for a position is a type error.</p>

      <H2 id="partial-values">Partial values</H2>
      <p>
        An object literal given for a property that holds an object writes only the fields it lists, at any depth:{' '}
        <code>{'position={{ y: 1 }}'}</code>, <code>{'shadow={{ mapSize: [2048, 2048], camera: { far: 50 } }}'}</code>. Fields it
        leaves out keep their values. A Partial value on <code>material</code> reaches the material a child attaches.
      </p>
      <Example component={PartialValues} code={partialValuesCode} />

      <H2 id="attach">Attach</H2>
      <p>A component's Instance joins the Instance of the Scene component around it, or the scene at the top:</p>
      <DocTable head={['Instance', 'Default']} rows={ATTACH.map(([instance, how]) => [instance, how])} />
      <p>
        <code>attach</code> overrides it: a property path (<code>attach="map"</code> on a texture inside a material,{' '}
        <code>attach="fog"</code>, <code>attach="material.1"</code>) or a function <code>(parent, self) =&gt; detach</code>.
        Detaching restores what was there before.
      </p>

      <H2 id="rebuild">args and Rebuild</H2>
      <p>
        <code>args</code> are the constructor arguments, for what three.js takes only in the constructor. A change to{' '}
        <code>args</code> is a Rebuild: it disposes the old Instance, constructs a new one from the new <code>args</code>, applies
        the props, puts it in the old one's place and moves the children over. Children keep their state, and the ref is called
        again. <code>args</code> is compared element by element, so the same numbers again are not a change. A Rebuild costs a new
        Instance and a GPU upload, so animate through props, not <code>args</code>.
      </p>
      <Example component={Rebuild} code={rebuildCode} />

      <H2 id="existing-objects">Adopted Instances</H2>
      <p>
        <code>object</code> hands a component an Instance that already exists, such as a loaded model, instead of constructing
        one. It's attached, gets the props and children, and is never disposed by the component. A new <code>object</code> takes
        the old one's place, like a Rebuild. Whether a component adopts is decided once, when it is created.
      </p>
      <CodeBlock code={`<T.Group object={gltf().scene} position={[0, 1, 0]} />`} />

      <H2 id="notes">Notes</H2>
      <ul>
        <li>
          A ref (<code>let mesh!: Mesh; &lt;T.Mesh ref={'{mesh}'} /&gt;</code>) gets the Instance once its props are applied and
          it is attached, before its children attach. After changing it through the ref, Invalidate the Canvas:{' '}
          <code>invalidate()</code>, or <code>canvas.invalidate()</code> on a <code>useCanvas()</code> handle taken in the
          component body.
        </li>
        <li>
          Owned Instances are disposed with their owner; pass <code>{'dispose={false}'}</code> to keep one.
        </li>
        <li>Which props a component has is read once; their values are reactive.</li>
      </ul>
    </article>
  );
}
