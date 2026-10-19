import { render } from '@solidjs/testing-library';
import { captureArtifact } from '@solidjs/diagnostics';
import { flush } from 'solid-js';
import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, test } from 'vitest';
import { stubFactory } from '../../test/harness';
import { sceneComponent } from '../scene-component';
import { Canvas } from '.';

const T = {
  Mesh: sceneComponent(Mesh),
  BoxGeometry: sceneComponent(BoxGeometry),
  MeshBasicMaterial: sceneComponent(MeshBasicMaterial),
};

// Real raycasts, layout and input are in pointer-events.browser.test.tsx; jsdom lays nothing out, so the canvas is
// given a rect by hand here.
function mount(scene: () => ReturnType<typeof T.Mesh>) {
  const { container } = render(() => (
    <Canvas renderer={stubFactory().factory} frameloop="never">
      {scene()}
    </Canvas>
  ));
  flush();
  const canvas = container.querySelector('canvas')!;
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100);
  return { canvas, click: () => canvas.dispatchEvent(new MouseEvent('click', { clientX: 50, clientY: 50 })) };
}

describe('pointer event props', () => {
  test('are handlers, not Instance props', () => {
    let mesh!: Mesh;
    let clicks = 0;
    const { click } = mount(() => (
      <T.Mesh ref={mesh} onClick={() => clicks++}>
        <T.BoxGeometry />
      </T.Mesh>
    ));
    click();
    expect(clicks).toBe(1);
    expect('onClick' in mesh).toBe(false);
  });

  test('are typed for Object3D Instances only', () => {
    // @ts-expect-error: a material isn't an Object3D, so it takes no pointer event handlers.
    void (() => <T.MeshBasicMaterial onClick={() => {}} />);
    void (() => <T.Mesh onClick={(event) => event.intersection.point} />);
  });

  test('hit-testing and delivery run no reactive code', async () => {
    let clicks = 0;
    const { click } = mount(() => (
      <T.Mesh onClick={() => clicks++}>
        <T.BoxGeometry />
      </T.Mesh>
    ));
    const { artifact } = await captureArtifact(
      async () => {
        click();
        click();
        await Promise.resolve();
      },
      { scenario: 'click' },
    );
    expect(clicks).toBe(2);
    expect(artifact).toHaveNoDiagnostics({ allow: ['HOT_SCOPE_TIME'] });
    expect(artifact).toStayWithinRerunBudget(0);
  });
});
