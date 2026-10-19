import { render } from '@solidjs/testing-library';
import { captureArtifact } from '@solidjs/diagnostics';
import type { JSX } from '@solidjs/web';
import { createSignal, createStore, flush, Show } from 'solid-js';
import { BoxGeometry, DirectionalLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D } from 'three';
import { describe, expect, test } from 'vitest';
import { stubFactory } from '../../test/harness';
import { Canvas } from '../canvas';
import { sceneComponent } from '.';

const T = {
  Mesh: sceneComponent(Mesh),
  StandardMesh: sceneComponent(Mesh<BoxGeometry, MeshStandardMaterial>),
  MeshBasicMaterial: sceneComponent(MeshBasicMaterial),
  MeshStandardMaterial: sceneComponent(MeshStandardMaterial),
  DirectionalLight: sceneComponent(DirectionalLight),
};

function mount(scene: () => JSX.Element) {
  const utils = render(() => <Canvas renderer={stubFactory().factory}>{scene()}</Canvas>);
  flush();
  return utils;
}

describe('Partial values', () => {
  test('write only the fields they list, into the same object', () => {
    const [y, setY] = createSignal(1);
    let mesh!: Mesh;
    mount(() => <T.Mesh ref={mesh} position={{ y: y() }} />);
    const position = mesh.position;
    mesh.position.x = 5;
    setY(2);
    flush();
    expect(mesh.position.toArray()).toEqual([5, 2, 0]);
    expect(mesh.position).toBe(position);
  });

  test('apply the copy rules to each field, at any depth', () => {
    let light!: DirectionalLight;
    let mesh!: Mesh<BoxGeometry, MeshStandardMaterial>;
    mount(() => (
      <>
        <T.DirectionalLight ref={light} shadow={{ mapSize: [1024, 2048], bias: -0.001, camera: { far: 50 } }} />
        <T.StandardMesh ref={mesh} material={{ color: 'hotpink', emissive: [0, 0, 1] }}>
          <T.MeshStandardMaterial />
        </T.StandardMesh>
      </>
    ));
    expect(light.shadow.mapSize.toArray()).toEqual([1024, 2048]);
    expect(light.shadow.bias).toBe(-0.001);
    expect(light.shadow.camera.far).toBe(50);
    expect(mesh.material.color.getHexString()).toBe('ff69b4');
    expect(mesh.material.emissive.getHex()).toBe(0x0000ff);
  });

  test('reach the material a child attaches after them, and the one that replaces it', () => {
    const [standard, setStandard] = createSignal(true);
    const [opacity, setOpacity] = createSignal(0.5);
    let mesh!: Mesh;
    mount(() => (
      <T.Mesh ref={mesh} material={{ opacity: opacity() }}>
        <Show when={standard()} fallback={<T.MeshBasicMaterial />}>
          <T.MeshStandardMaterial opacity={1} />
        </Show>
      </T.Mesh>
    ));
    expect(mesh.material).toBeInstanceOf(MeshStandardMaterial);
    expect((mesh.material as MeshStandardMaterial).opacity).toBe(0.5);

    setStandard(false);
    flush();
    expect(mesh.material).toBeInstanceOf(MeshBasicMaterial);
    expect((mesh.material as MeshBasicMaterial).opacity).toBe(0.5);

    setOpacity(0.25);
    flush();
    expect((mesh.material as MeshBasicMaterial).opacity).toBe(0.25);
  });

  test('wait for an empty property to be filled', () => {
    class Holder extends Object3D {
      target: Object3D | null = null;
    }
    const Hold = sceneComponent(Holder);
    let holder!: Holder;
    mount(() => <Hold ref={holder} target={{ visible: false }} />);
    expect(holder.target).toBeNull();
  });

  test('replace a plain record, and an object of a class as a whole', () => {
    const material = new MeshStandardMaterial();
    let mesh!: Mesh;
    mount(() => <T.Mesh ref={mesh} userData={{ id: 7 }} material={material} />);
    expect(mesh.userData).toEqual({ id: 7 });
    expect(mesh.material).toBe(material);
  });

  test('skip a field the current object does not have, adding nothing to it', () => {
    let mesh!: Mesh;
    mount(() => <T.Mesh ref={mesh} {...({ position: { y: 2, w: 1 } } as object)} />);
    expect(mesh.position.toArray()).toEqual([0, 2, 0]);
    expect(mesh.position).not.toHaveProperty('w');
  });

  test('are typed from the declared type, at any depth', () => {
    void (() => (
      <>
        <T.Mesh position={{ x: 1 }} rotation={{ order: 'XYZ' }} material={{ opacity: 0.5 }} geometry={{ name: 'box' }} />
        <T.StandardMesh material={{ color: 0xff0000, roughness: 0.5 }} />
        <T.DirectionalLight shadow={{ camera: { near: 1 }, mapSize: { x: 512 } }} />
      </>
    ));
    // @ts-expect-error a Vector3 has no w
    void (() => <T.Mesh position={{ w: 1 }} />);
    // @ts-expect-error a field takes its own type
    void (() => <T.Mesh position={{ y: '1' }} />);
    // @ts-expect-error a plain Mesh's material is a Material, which has no color
    void (() => <T.Mesh material={{ color: 'red' }} />);
    // @ts-expect-error and so on, at any depth
    void (() => <T.DirectionalLight shadow={{ camera: { fov: 1 } }} />);
  });
});

describe('Partial value diagnostics', () => {
  test('a change re-runs only its own binding, and store-backed objects raise no diagnostics', async () => {
    const [store, setStore] = createStore({ shadow: { bias: 0, mapSize: [512, 512] as [number, number] } });
    let light!: DirectionalLight;
    mount(() => <T.DirectionalLight ref={light} shadow={store.shadow} intensity={2} />);
    const { artifact } = await captureArtifact(
      async () => {
        setStore((s) => {
          s.shadow.mapSize[0] = 1024;
        });
        flush();
        await Promise.resolve();
      },
      { scenario: 'partial-value-change' },
    );
    expect(artifact).toHaveNoDiagnostics({ allow: ['HOT_SCOPE_TIME'] });
    expect(artifact).toStayWithinRerunBudget(1);
    expect(light.shadow.mapSize.toArray()).toEqual([1024, 512]);
  });
});
