import { render } from '@solidjs/testing-library';
import { captureArtifact } from '@solidjs/diagnostics';
import type { JSX } from '@solidjs/web';
import { createSignal, flush, Show } from 'solid-js';
import { BoxGeometry, BufferGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Scene } from 'three';
import { describe, expect, test, vi } from 'vitest';
import { stubFactory } from '../../test/harness';
import { Canvas, useCanvas } from '../canvas';
import { sceneComponent } from '.';

const T = {
  Object3D: sceneComponent(Object3D),
  Group: sceneComponent(Group),
  Mesh: sceneComponent(Mesh),
  BufferGeometry: sceneComponent(BufferGeometry),
  MeshStandardMaterial: sceneComponent(MeshStandardMaterial),
};

function mount(scene: () => JSX.Element) {
  let root!: Scene;
  const Probe = () => {
    root = useCanvas().scene;
    return null;
  };
  const utils = render(() => (
    <Canvas renderer={stubFactory().factory}>
      <Probe />
      {scene()}
    </Canvas>
  ));
  flush();
  return { ...utils, scene: root };
}

// Stands in for a loaded model: a scene graph built elsewhere.
function model(name: string) {
  const root = new Group();
  root.name = name;
  root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
  return root;
}

describe('Adopted Instances', () => {
  test('attaches the object it is given, applies the props to it and passes it to the ref', () => {
    const loaded = model('model');
    let ref: Object3D | undefined;
    const { scene } = mount(() => <T.Object3D object={loaded} position={[0, 1, 0]} ref={(o: Object3D) => (ref = o)} />);
    expect(scene.children).toEqual([loaded]);
    expect(loaded.position.y).toBe(1);
    expect(ref).toBe(loaded);
  });

  test('attaches the Scene components inside it to the object', () => {
    const loaded = model('model');
    let added!: Mesh;
    mount(() => (
      <T.Group object={loaded}>
        <T.Mesh ref={added} name="added" />
      </T.Group>
    ));
    expect(loaded.children.at(-1)).toBe(added);
    expect(added.parent).toBe(loaded);
  });

  test('attaches to a slot like an Owned Instance, restoring what was there', () => {
    const shared = new BufferGeometry();
    const [shown, setShown] = createSignal(true);
    let mesh!: Mesh;
    mount(() => (
      <T.Mesh ref={mesh}>
        <Show when={shown()}>
          <T.BufferGeometry object={shared} />
        </Show>
      </T.Mesh>
    ));
    expect(mesh.geometry).toBe(shared);
    setShown(false);
    flush();
    expect(mesh.geometry).not.toBe(shared);
  });

  test('never disposes it, with or without dispose', () => {
    const shared = new BufferGeometry();
    const dispose = vi.spyOn(shared, 'dispose');
    const { unmount } = mount(() => (
      <T.Mesh>
        <T.BufferGeometry object={shared} dispose />
      </T.Mesh>
    ));
    unmount();
    expect(dispose).not.toHaveBeenCalled();
  });

  test("puts a new object in the old one's place, moving the children and calling the ref again", () => {
    const first = model('first');
    const second = model('second');
    const [object, setObject] = createSignal(first);
    const refs: Group[] = [];
    let added!: Mesh;
    const { scene } = mount(() => (
      <>
        <T.Group name="before" />
        <T.Group object={object()} ref={(group: Group) => refs.push(group)} scale={2}>
          <T.Mesh ref={added} name="added" />
        </T.Group>
        <T.Group name="after" />
      </>
    ));
    const inner = first.children[0] as Mesh;
    const disposed = [vi.spyOn(inner.geometry, 'dispose'), vi.spyOn(inner.material as MeshStandardMaterial, 'dispose')];

    setObject(second);
    flush();
    expect(scene.children.map((child) => child.name)).toEqual(['before', 'second', 'after']);
    expect(first.parent).toBeNull();
    expect(added.parent).toBe(second);
    expect(first.children).not.toContain(added);
    expect(second.scale.toArray()).toEqual([2, 2, 2]);
    expect(refs).toEqual([first, second]);
    for (const spy of disposed) expect(spy).not.toHaveBeenCalled();
    expect(inner.parent).toBe(first);
  });

  test('throws for a missing object', () => {
    expect(() => mount(() => <T.Object3D object={null as unknown as Object3D} />)).toThrow(/Object3D got null/);
  });

  test('takes args or object, never both, and an object of its own class', () => {
    void (() => <T.Mesh object={new Mesh()} />);
    // @ts-expect-error args and object together
    void (() => <T.Mesh args={[]} object={new Mesh()} />);
    // @ts-expect-error a Mesh component adopts a Mesh
    void (() => <T.Mesh object={new Group()} />);
  });
});

describe('Adopted Instance diagnostics', () => {
  test('swapping the object raises no diagnostics', async () => {
    const [object, setObject] = createSignal(model('first'));
    mount(() => (
      <T.Group object={object()} position={[1, 0, 0]}>
        <T.Mesh />
      </T.Group>
    ));
    const { artifact } = await captureArtifact(
      async () => {
        setObject(model('second'));
        flush();
        await Promise.resolve();
      },
      { scenario: 'adopted-swap' },
    );
    expect(artifact).toHaveNoDiagnostics({ allow: ['HOT_SCOPE_TIME'] });
  });
});
