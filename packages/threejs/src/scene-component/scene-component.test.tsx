import { render } from '@solidjs/testing-library';
import { captureArtifact } from '@solidjs/diagnostics';
import type { JSX } from '@solidjs/web';
import { createRoot, createSignal, flush, Show } from 'solid-js';
import { BoxGeometry, Fog, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Scene, Texture } from 'three';
import { describe, expect, test, vi } from 'vitest';
import { stubFactory } from '../../test/harness';
import { Canvas, useCanvas } from '../canvas';
import { sceneComponent } from '.';

const T = {
  Mesh: sceneComponent(Mesh),
  Group: sceneComponent(Group),
  BoxGeometry: sceneComponent(BoxGeometry),
  MeshBasicMaterial: sceneComponent(MeshBasicMaterial),
  MeshStandardMaterial: sceneComponent(MeshStandardMaterial),
  Fog: sceneComponent(Fog),
  Texture: sceneComponent(Texture),
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

describe('sceneComponent', () => {
  test('constructs the Instance from args', () => {
    let box!: BoxGeometry;
    mount(() => (
      <T.Mesh>
        <T.BoxGeometry args={[2, 3, 4]} ref={box} />
      </T.Mesh>
    ));
    expect(box).toBeInstanceOf(BoxGeometry);
    expect(box.parameters).toMatchObject({ width: 2, height: 3, depth: 4 });
  });

  test('is named after the class it wraps', () => {
    expect(T.Mesh.name).toBe('Mesh');
  });

  test('throws outside a Canvas', () => {
    createRoot((dispose) => {
      expect(() => T.Mesh({})).toThrow();
      dispose();
    });
  });
});

describe('Attach', () => {
  test("adds an Object3D to the scene, and nested ones to the Object3D they're in", () => {
    let group!: Group;
    let mesh!: Mesh;
    const { scene } = mount(() => (
      <T.Group ref={group}>
        <T.Mesh ref={mesh} />
      </T.Group>
    ));
    expect(scene.children).toEqual([group]);
    expect(group.children).toEqual([mesh]);
    expect(mesh.parent).toBe(group);
  });

  test('assigns a BufferGeometry to geometry and a Material to material', () => {
    let mesh!: Mesh;
    let box!: BoxGeometry;
    let material!: MeshStandardMaterial;
    mount(() => (
      <T.Mesh ref={mesh}>
        <T.BoxGeometry ref={box} />
        <T.MeshStandardMaterial ref={material} />
      </T.Mesh>
    ));
    expect(mesh.geometry).toBe(box);
    expect(mesh.material).toBe(material);
  });

  test('assigns to the property path in attach, nested or not', () => {
    let scene!: Scene;
    let fog!: Fog;
    let material!: MeshStandardMaterial;
    let map!: Texture;
    ({ scene } = mount(() => (
      <>
        <T.Fog attach="fog" args={[0xffffff, 1, 10]} ref={fog} />
        <T.Mesh>
          <T.MeshStandardMaterial ref={material} />
          <T.Texture attach="material.map" ref={map} />
        </T.Mesh>
      </>
    )));
    expect(scene.fog).toBe(fog);
    expect(material.map).toBe(map);
  });

  test('calls an attach function with the parent and the Instance, and its result on disposal', () => {
    const detach = vi.fn();
    const how = vi.fn(() => detach);
    let mesh!: Mesh;
    let material!: MeshBasicMaterial;
    const { unmount } = mount(() => (
      <T.Mesh ref={mesh}>
        <T.MeshBasicMaterial attach={how} ref={material} />
      </T.Mesh>
    ));
    expect(how).toHaveBeenCalledExactlyOnceWith(mesh, material);
    expect(detach).not.toHaveBeenCalled();
    unmount();
    expect(detach).toHaveBeenCalledOnce();
  });

  test('restores what the slot held before when an Instance detaches', () => {
    const [shown, setShown] = createSignal(true);
    let mesh!: Mesh;
    mount(() => (
      <T.Mesh ref={mesh}>
        <Show when={shown()}>
          <T.MeshStandardMaterial />
        </Show>
      </T.Mesh>
    ));
    expect(mesh.material).toBeInstanceOf(MeshStandardMaterial);
    setShown(false);
    flush();
    // The MeshBasicMaterial a Mesh is constructed with.
    expect(mesh.material).toBeInstanceOf(MeshBasicMaterial);
  });

  test('keeps the latest claim on a slot when an earlier one leaves first, and the original when both have', () => {
    const [first, setFirst] = createSignal(true);
    const [second, setSecond] = createSignal(false);
    let mesh!: Mesh;
    let a!: MeshStandardMaterial;
    let b!: MeshStandardMaterial;
    mount(() => (
      <T.Mesh ref={mesh}>
        <Show when={first()}>
          <T.MeshStandardMaterial ref={a} />
        </Show>
        <Show when={second()}>
          <T.MeshStandardMaterial ref={b} />
        </Show>
      </T.Mesh>
    ));
    expect(mesh.material).toBe(a);
    setSecond(true);
    flush();
    expect(mesh.material).toBe(b);
    setFirst(false);
    flush();
    expect(mesh.material).toBe(b);
    setSecond(false);
    flush();
    expect(mesh.material).toBeInstanceOf(MeshBasicMaterial);
  });

  test('removes an Object3D from its parent on disposal', () => {
    const [shown, setShown] = createSignal(true);
    let mesh!: Mesh;
    const { scene } = mount(() => (
      <Show when={shown()}>
        <T.Mesh ref={mesh} />
      </Show>
    ));
    expect(mesh.parent).toBe(scene);
    setShown(false);
    flush();
    expect(mesh.parent).toBeNull();
    expect(scene.children).toEqual([]);
  });

  test("throws for an Object3D whose parent isn't one", () => {
    expect(() =>
      mount(() => (
        <T.MeshBasicMaterial attach={() => () => {}}>
          <T.Mesh />
        </T.MeshBasicMaterial>
      )),
    ).toThrow(/isn't an Object3D/);
  });

  test('throws for a class with no default place, naming the fix', () => {
    class Thing {}
    const Custom = sceneComponent(Thing);
    expect(() => mount(() => <Custom />)).toThrow(/Thing has no default place.*attach/);
  });

  test('throws for a path through a missing property', () => {
    expect(() => mount(() => <T.Texture attach="missing.map" />)).toThrow(/"missing" is undefined/);
  });
});

describe('refs', () => {
  test('calls a callback, and every entry of an array, with the Instance already attached', () => {
    const seen: Array<Mesh | null> = [];
    let assigned!: Mesh;
    const { scene } = mount(() => (
      <T.Mesh ref={[(mesh: Mesh) => seen.push(mesh.parent as Mesh | null), (mesh: Mesh) => (assigned = mesh)]} />
    ));
    expect(seen).toEqual([scene]);
    expect(assigned.parent).toBe(scene);
  });
});

describe('disposal', () => {
  test('disposes an Owned Instance with its owner', () => {
    const [shown, setShown] = createSignal(true);
    let box!: BoxGeometry;
    mount(() => (
      <T.Mesh>
        <Show when={shown()}>
          <T.BoxGeometry ref={box} />
        </Show>
      </T.Mesh>
    ));
    const dispose = vi.spyOn(box, 'dispose');
    setShown(false);
    flush();
    expect(dispose).toHaveBeenCalledOnce();
  });

  test('keeps it with dispose={false}, detaching it all the same', () => {
    const [shown, setShown] = createSignal(true);
    let mesh!: Mesh;
    let box!: BoxGeometry;
    mount(() => (
      <T.Mesh ref={mesh}>
        <Show when={shown()}>
          <T.BoxGeometry dispose={false} ref={box} />
        </Show>
      </T.Mesh>
    ));
    const dispose = vi.spyOn(box, 'dispose');
    setShown(false);
    flush();
    expect(dispose).not.toHaveBeenCalled();
    expect(mesh.geometry).not.toBe(box);
  });

  test('disposes the whole subtree with the Canvas', () => {
    let box!: BoxGeometry;
    let material!: MeshStandardMaterial;
    const { unmount, scene } = mount(() => (
      <T.Mesh>
        <T.BoxGeometry ref={box} />
        <T.MeshStandardMaterial ref={material} />
      </T.Mesh>
    ));
    const disposed = [vi.spyOn(box, 'dispose'), vi.spyOn(material, 'dispose')];
    unmount();
    for (const spy of disposed) expect(spy).toHaveBeenCalledOnce();
    expect(scene.children).toEqual([]);
  });
});

describe('diagnostics', () => {
  test('mounting a scene and swapping a material raise no diagnostics', async () => {
    const [standard, setStandard] = createSignal(true);
    const { artifact } = await captureArtifact(
      async () => {
        mount(() => (
          <T.Group>
            <T.Mesh>
              <T.BoxGeometry args={[1, 1, 1]} />
              <Show when={standard()} fallback={<T.MeshBasicMaterial />}>
                <T.MeshStandardMaterial />
              </Show>
            </T.Mesh>
          </T.Group>
        ));
        setStandard(false);
        flush();
        await Promise.resolve();
      },
      { scenario: 'scene-component-swap' },
    );
    expect(artifact).toHaveNoDiagnostics({ allow: ['HOT_SCOPE_TIME'] });
  });
});
