/**
 * A Scene component for every scene-graph class three.js exports: `<T.Mesh>`, `<T.BoxGeometry>`, `<T.PointLight>`.
 * A static namespace, so a bundler keeps only the members an app uses (ADR 0025).
 */
export * as T from './components.gen';
