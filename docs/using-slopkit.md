# Using slopkit threejs in an app

This guide is for coding agents that add `@solid-slopkit/threejs` to a SolidJS 2.x app. It covers how to install it from npm, how to write a first scene, and how to make the docs shipped in the package available to future agent sessions.

Repository: https://github.com/solid-slopkit/threejs

Docs site: https://solid-slopkit.github.io/threejs/. It is built from `main` and can be ahead of the latest release; the docs inside the installed package match the installed version, so prefer those.

## The package

`@solid-slopkit/threejs` describes three.js scenes with Solid components inside a `Canvas`: Scene components from `T` create three.js objects and keep their properties in step with signals. It depends on no other `@solid-slopkit` package.

It needs `solid-js` and `@solidjs/web` 2.x, which a Solid 2 app already has, and `three` r171 or later. It ships uncompiled JSX under the `solid` export condition, so the app compiles it with its own Solid plugin (`@solidjs/vite-plugin`). This needs no configuration.

## 1. Install

```bash
pnpm add @solid-slopkit/threejs three
pnpm add -D @types/three
```

## 2. Set it up

No setup beyond installing `three`. The package has an index for agents at `node_modules/@solid-slopkit/threejs/dist/source/llms.md`, with a reference per area. Read it. A scene is a `Canvas` with Scene components from `T` in it:

```tsx
import { Canvas, T } from '@solid-slopkit/threejs';

export function Scene() {
  return (
    <div style={{ height: '400px' }}>
      <Canvas camera={{ position: [0, 0, 4] }}>
        <T.AmbientLight intensity={0.5} />
        <T.DirectionalLight position={[2, 4, 3]} />
        <T.Mesh>
          <T.BoxGeometry />
          <T.MeshStandardMaterial color="hotpink" />
        </T.Mesh>
      </Canvas>
    </div>
  );
}
```

- The `Canvas` fills its parent, so give the parent a size.
- The default camera looks down the negative Z axis from its `position`, and does not turn toward the origin. Keep what the scene shows in front of it, or a correct scene renders an empty canvas.
- three.js is large, so the first build may warn that a chunk is over 500 kB. Load the page or component that holds the `Canvas` lazily to split it out.
- Orbit controls are in `@solid-slopkit/threejs/controls`, the WebGPU renderer in `@solid-slopkit/threejs/webgpu`.

## 3. Make the package docs available to later sessions

The package ships skills (task guides, `skills/<area>/SKILL.md`) and LLM references (the `llms.md` index and the pages it links). Both always match the installed version. Tell future agents about them in the app's agent instructions: add this section to `AGENTS.md`. Create the file if the app has none. If the file has a generated block (the templates' `<!-- BEGIN solid-2.0-primer -->` … `<!-- END solid-2.0-primer -->`), add the section after it, never inside it.

```markdown
## slopkit threejs

This app uses `@solid-slopkit/threejs`, installed from npm. To upgrade, run `pnpm up @solid-slopkit/threejs --latest`.

Read the docs inside the installed package, not the web; they match the installed version:

- `node_modules/@solid-slopkit/threejs/dist/source/llms.md`: the Canvas, Scene components, controls, assets and WebGPU. Skills: `node_modules/@solid-slopkit/threejs/skills/{scenes,animation,assets}/SKILL.md`.

Before working on a scene, read the skill for the task first, then the reference for each area you use.
```

**Claude Code** reads `CLAUDE.md`, not `AGENTS.md`. If the app has no `CLAUDE.md`, create one that contains the line `@AGENTS.md`. To make the skills load on their own when a task matches them, also link each one into `.claude/skills`:

```bash
mkdir -p .claude/skills
for skill in node_modules/@solid-slopkit/*/skills/*/; do
  ln -sfn "../../$skill" ".claude/skills/$(sed -n 's/^name: //p' "$skill/SKILL.md")"
done
```

Commit the links. They are relative and point into `node_modules`, so they resolve after `pnpm install` on any clone and follow upgrades. Run the loop again after an upgrade, to pick up new skills.

## 4. Check it works

1. `pnpm build` succeeds, and `pnpm exec tsc --noEmit` reports no errors.
2. `pnpm dev`, open the app, and check that the `Canvas` shows the scene, not an empty canvas, and the browser console shows no errors.
