import { WebGPURenderer, type WebGPURendererParameters } from 'three/webgpu';
import type { RendererFactory } from '../canvas';

/**
 * A renderer factory for `<Canvas renderer>` that makes a `WebGPURenderer` for the canvas with `parameters`, and
 * resolves once its `init()` has: no Frame renders before then. Where WebGPU isn't available, the renderer falls back
 * to its WebGL 2 backend on its own (unless `parameters` say otherwise).
 */
export function webgpuRenderer(parameters: Omit<WebGPURendererParameters, 'canvas'> = {}): RendererFactory {
  return async (canvas) => {
    const renderer = new WebGPURenderer({ ...parameters, canvas });
    await renderer.init();
    return renderer;
  };
}
