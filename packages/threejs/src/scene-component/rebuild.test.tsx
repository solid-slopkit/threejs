import { render } from '@solidjs/testing-library';
import { captureArtifact } from '@solidjs/diagnostics';
import type { JSX } from '@solidjs/web';
import { createSignal, flush, Show } from 'solid-js';
import { BoxGeometry, Fog, Group, Mesh, MeshStandardMaterial, Scene } from 'three';
import { describe, expect, test, vi } from 'vitest';
import { stubFactory } from '../../test/harness';
import { Canvas, useCanvas } from '../canvas';
import { sceneComponent } from '.';

const T = {
  Mesh: sceneComponent(Mesh),
  Group: sceneComponent(Group),
  BoxGeometry: sceneComponent(BoxGeometry),
  MeshStandardMaterial: sceneComponent(MeshStandardMaterial),
  Fog: sceneComponent(Fog),
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

describe('Rebuild', () => {
  test("a change to args puts a new Instance in the old one's place and disposes the old one", () => {
    const [width, setWidth] = createSignal(1);
    const boxes: BoxGeometry[] = [];
    let mesh!: Mesh;
    mount(() => (
      <T.Mesh ref={mesh}>
        <T.BoxGeometry args={[width(), 1, 1]} ref={(box: BoxGeometry) => boxes.push(box)} />
      </T.Mesh>
    ));
    const first = boxes[0]!;
    const dispose = vi.spyOn(first, 'dispose');

    setWidth(2);
    flush();
    expect(boxes).toHaveLength(2);
    const second = boxes[1]!;
    expect(second).not.toBe(first);
    expect(second.parameters.width).toBe(2);
    expect(mesh.geometry).toBe(second);
    expect(dispose).toHaveBeenCalledOnce();
  });

  test('args with the same values are not a change', () => {
    const [width, setWidth] = createSignal(1);
    const [other, setOther] = createSignal(0);
    const refs = vi.fn();
    mount(() => <T.BoxGeometry args={[width(), 1, Math.min(1, 1 + other())]} ref={refs} attach={() => () => {}} />);
    setOther(5);
    setWidth(1);
    flush();
    expect(refs).toHaveBeenCalledOnce();
  });

  test('the new Instance gets the current props before it is attached', () => {
    const [far, setFar] = createSignal(10);
    const [near, setNear] = createSignal(1);
    let scene!: Scene;
    const seen: Array<[number, unknown]> = [];
    ({ scene } = mount(() => (
      <T.Fog
        attach={(parent: Scene, fog: Fog) => {
          seen.push([fog.near, fog.color.getHex()]);
          parent.fog = fog;
          return () => (parent.fog = null);
        }}
        args={[0xffffff, near(), 100]}
        far={far()}
        color={0xff0000}
      />
    )));
    setFar(50);
    flush();
    setNear(2);
    flush();
    expect((scene.fog as Fog).near).toBe(2);
    expect((scene.fog as Fog).far).toBe(50);
    expect(seen.at(-1)).toEqual([2, 0xff0000]);
  });

  test('keeps an Object3D in its position among its siblings', () => {
    const [size, setSize] = createSignal(1);
    const meshes: Mesh[] = [];
    const { scene } = mount(() => (
      <>
        <T.Group name="before" />
        <T.Mesh args={[new BoxGeometry(size(), 1, 1)]} ref={(mesh: Mesh) => meshes.push(mesh)} />
        <T.Group name="after" />
      </>
    ));
    setSize(2);
    flush();
    expect(scene.children.map((child) => child.name || 'mesh')).toEqual(['before', 'mesh', 'after']);
    expect(scene.children[1]).toBe(meshes[1]);
    expect(meshes[0]!.parent).toBeNull();
  });

  test('moves the children to the new Instance, in order, without running them again', () => {
    const [count, setCount] = createSignal(1);
    const Holder = sceneComponent(
      class Holder extends Group {
        constructor(readonly size = 1) {
          super();
        }
      },
    );
    const holders: Group[] = [];
    let materialRuns = 0;
    const Material = () => {
      materialRuns++;
      return <T.MeshStandardMaterial />;
    };
    mount(() => (
      <Holder args={[count()]} ref={(holder: Group) => holders.push(holder)}>
        <T.Mesh name="a">
          <Material />
        </T.Mesh>
        <T.Mesh name="b" />
      </Holder>
    ));
    const [first] = holders;
    setCount(2);
    flush();
    const second = holders[1]!;
    expect(second).not.toBe(first);
    expect(second.children.map((child) => child.name)).toEqual(['a', 'b']);
    expect(first!.children).toEqual([]);
    expect(materialRuns).toBe(1);
    expect((second.children[0] as Mesh).material).toBeInstanceOf(MeshStandardMaterial);
  });

  test('keeps the state of components inside it', () => {
    const [size, setSize] = createSignal(1);
    let setInner!: (value: number) => void;
    let mesh!: Mesh;
    const Inner = () => {
      const [x, set] = createSignal(0);
      setInner = set;
      return <T.Mesh ref={mesh} position={[x(), 0, 0]} />;
    };
    const Holder = sceneComponent(
      class extends Group {
        constructor(readonly size = 1) {
          super();
        }
      },
    );
    mount(() => (
      <Holder args={[size()]}>
        <Inner />
      </Holder>
    ));
    setInner(3);
    flush();
    setSize(2);
    flush();
    expect(mesh.position.x).toBe(3);
    setInner(4);
    flush();
    expect(mesh.position.x).toBe(4);
  });

  test("keeps a material's claim on the slot it holds", () => {
    const [roughness, setRoughness] = createSignal(0.5);
    const [second, setSecond] = createSignal(true);
    const Rough = sceneComponent(
      class extends MeshStandardMaterial {
        constructor(r = 0.5) {
          super({ roughness: r });
        }
      },
    );
    let mesh!: Mesh;
    let top!: MeshStandardMaterial;
    mount(() => (
      <T.Mesh ref={mesh}>
        <Rough args={[roughness()]} />
        <Show when={second()}>
          <T.MeshStandardMaterial ref={top} />
        </Show>
      </T.Mesh>
    ));
    expect(mesh.material).toBe(top);
    setRoughness(0.9);
    flush();
    // The later claim still wins; the rebuilt one waits under it.
    expect(mesh.material).toBe(top);
    setSecond(false);
    flush();
    expect((mesh.material as MeshStandardMaterial).roughness).toBe(0.9);
  });

  test('disposes only the last Instance with its owner, and none with dispose={false}', () => {
    const [width, setWidth] = createSignal(1);
    const boxes: BoxGeometry[] = [];
    const { unmount } = mount(() => (
      <T.Mesh>
        <T.BoxGeometry args={[width(), 1, 1]} ref={(box: BoxGeometry) => boxes.push(box)} />
      </T.Mesh>
    ));
    setWidth(2);
    flush();
    const last = vi.spyOn(boxes[1]!, 'dispose');
    unmount();
    expect(last).toHaveBeenCalledOnce();

    const kept: BoxGeometry[] = [];
    const [w, setW] = createSignal(1);
    mount(() => (
      <T.Mesh>
        <T.BoxGeometry dispose={false} args={[w(), 1, 1]} ref={(box: BoxGeometry) => kept.push(box)} />
      </T.Mesh>
    ));
    const spy = vi.spyOn(kept[0]!, 'dispose');
    setW(2);
    flush();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Rebuild diagnostics', () => {
  test('a Rebuild raises no diagnostics and leaves sibling Instances alone', async () => {
    const [width, setWidth] = createSignal(1);
    mount(() => (
      <>
        <T.Mesh position={[1, 0, 0]}>
          <T.BoxGeometry args={[width(), 1, 1]} />
          <T.MeshStandardMaterial color="red" />
        </T.Mesh>
        <T.Mesh position={[2, 0, 0]} scale={2}>
          <T.BoxGeometry />
        </T.Mesh>
      </>
    ));
    const { artifact } = await captureArtifact(
      async () => {
        setWidth(2);
        flush();
        await Promise.resolve();
      },
      { scenario: 'rebuild' },
    );
    expect(artifact).toHaveNoDiagnostics({ allow: ['HOT_SCOPE_TIME'] });
    // Only the rebuilt BoxGeometry's own scopes re-run: its args and Instance, the swap into mesh.geometry and its ref.
    expect(artifact).toStayWithinRerunBudget(0, { scope: /^(Mesh|MeshStandardMaterial)\./ });
    expect(artifact).toStayWithinRerunBudget(4, { scope: /^BoxGeometry\./ });
  });
});
