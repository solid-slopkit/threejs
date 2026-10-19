import { render } from '@solidjs/testing-library';
import { captureArtifact } from '@solidjs/diagnostics';
import type { JSX } from '@solidjs/web';
import { createSignal, createStore, flush } from 'solid-js';
import { Color, Euler, Mesh, MeshStandardMaterial, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, test } from 'vitest';
import { stubFactory } from '../../test/harness';
import { Canvas } from '../canvas';
import { applyProp } from './props';
import { sceneComponent } from '.';

const T = {
  Mesh: sceneComponent(Mesh),
  MeshStandardMaterial: sceneComponent(MeshStandardMaterial),
  PerspectiveCamera: sceneComponent(PerspectiveCamera),
};

function mount(scene: () => JSX.Element) {
  const utils = render(() => <Canvas renderer={stubFactory().factory}>{scene()}</Canvas>);
  flush();
  return utils;
}

describe('applyProp', () => {
  test('spreads an array into set', () => {
    const mesh = new Mesh();
    const position = mesh.position;
    applyProp(mesh, 'position', [1, 2, 3]);
    expect(mesh.position).toBe(position);
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);

    applyProp(mesh, 'rotation', [0.1, 0.2, 0.3, 'YXZ']);
    expect(mesh.rotation.toArray()).toEqual([0.1, 0.2, 0.3, 'YXZ']);
  });

  test('sends a number to setScalar', () => {
    const mesh = new Mesh();
    applyProp(mesh, 'scale', 2);
    expect(mesh.scale.toArray()).toEqual([2, 2, 2]);
  });

  test('sends a number to set when there is no setScalar', () => {
    const mesh = new Mesh();
    const layers = mesh.layers;
    applyProp(mesh, 'layers', 3);
    expect(mesh.layers).toBe(layers);
    expect(mesh.layers.isEnabled(3)).toBe(true);
    expect(mesh.layers.isEnabled(0)).toBe(false);
  });

  test('copies an object of the same type into the existing one', () => {
    const mesh = new Mesh();
    const quaternion = mesh.quaternion;
    applyProp(mesh, 'quaternion', new Quaternion(0, 1, 0, 0));
    expect(mesh.quaternion).toBe(quaternion);
    expect(mesh.quaternion.toArray()).toEqual([0, 1, 0, 0]);
  });

  test('gives a Color anything Color.set takes, numbers included', () => {
    const material = new MeshStandardMaterial();
    const color = material.color;
    applyProp(material, 'color', 'hotpink');
    expect(material.color.getHexString()).toBe('ff69b4');
    applyProp(material, 'color', 0x00ff00);
    expect(material.color.getHex()).toBe(0x00ff00);
    applyProp(material, 'color', new Color(0x0000ff));
    expect(material.color.getHex()).toBe(0x0000ff);
    applyProp(material, 'color', [1, 0, 0]);
    expect(material.color.getHex()).toBe(0xff0000);
    expect(material.color).toBe(color);
  });

  test('leaves a math object alone for undefined', () => {
    const mesh = new Mesh();
    mesh.position.set(1, 2, 3);
    applyProp(mesh, 'position', undefined);
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
  });

  test('assigns everything else', () => {
    const mesh = new Mesh();
    const material = new MeshStandardMaterial();
    applyProp(mesh, 'visible', false);
    applyProp(mesh, 'name', 'box');
    applyProp(mesh, 'material', material);
    applyProp(mesh, 'userData', { id: 1 });
    expect(mesh.visible).toBe(false);
    expect(mesh.name).toBe('box');
    expect(mesh.material).toBe(material);
    expect(mesh.userData).toEqual({ id: 1 });
  });
});

describe('props on a Scene component', () => {
  test('are applied before the ref runs', () => {
    let seen: number[] = [];
    mount(() => <T.Mesh position={[1, 2, 3]} ref={(mesh: Mesh) => (seen = mesh.position.toArray())} />);
    expect(seen).toEqual([1, 2, 3]);
  });

  test('follow their changes, copying into the same math object', () => {
    const [x, setX] = createSignal(0);
    const [color, setColor] = createSignal<string>('red');
    let mesh!: Mesh;
    let material!: MeshStandardMaterial;
    mount(() => (
      <T.Mesh ref={mesh} position={[x(), 0, 0]} visible={x() < 5}>
        <T.MeshStandardMaterial ref={material} color={color()} />
      </T.Mesh>
    ));
    const position = mesh.position;
    setX(7);
    setColor('blue');
    flush();
    expect(mesh.position).toBe(position);
    expect(mesh.position.x).toBe(7);
    expect(mesh.visible).toBe(false);
    expect(material.color.getHex()).toBe(0x0000ff);
  });

  test("don't reach the reserved props or the instance's own fields of the same name", () => {
    let mesh!: Mesh;
    mount(() => <T.Mesh ref={mesh} dispose={false} />);
    expect(mesh).not.toHaveProperty('dispose', false);
  });

  test('accept the types the copy rules accept', () => {
    mount(() => (
      <>
        <T.Mesh position={new Vector3()} rotation={new Euler()} scale={1} layers={2} />
        <T.Mesh quaternion={[0, 0, 0, 1]} renderOrder={1} castShadow />
        <T.PerspectiveCamera fov={60} zoom={2} />
        <T.MeshStandardMaterial color="red" emissive={0x111111} roughness={0.5} transparent />
      </>
    ));
    // @ts-expect-error a Vector3 takes three numbers, not a string
    void (() => <T.Mesh position="up" />);
    // @ts-expect-error methods aren't props
    void (() => <T.Mesh lookAt={[0, 0, 0]} />);
  });
});

describe('prop diagnostics', () => {
  test('a change re-runs only its own binding, and store-backed arrays raise no diagnostics', async () => {
    const [store, setStore] = createStore({ position: [0, 0, 0] as [number, number, number], color: 'red' });
    let mesh!: Mesh;
    mount(() => (
      <T.Mesh ref={mesh} position={store.position} scale={2}>
        <T.MeshStandardMaterial color={store.color} roughness={0.5} />
      </T.Mesh>
    ));

    const { artifact } = await captureArtifact(
      async () => {
        setStore((s) => {
          s.position[1] = 4;
        });
        flush();
        await Promise.resolve();
      },
      { scenario: 'prop-change' },
    );
    expect(artifact).toHaveNoDiagnostics({ allow: ['HOT_SCOPE_TIME'] });
    expect(artifact).toStayWithinRerunBudget(1);
    expect(artifact).toStayWithinRerunBudget(1, { scope: /^Mesh\.position$/ });
    expect(mesh.position.y).toBe(4);
  });
});
