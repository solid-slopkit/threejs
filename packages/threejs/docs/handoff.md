# Handoff: `@solid-slopkit/threejs`, after T1.08

Written 2026-10-17 at the end of a session that designed the package and built T0.01–T1.08. Read this, then `AGENTS.md`, `CONTEXT-MAP.md`, [CONTEXT.md](../CONTEXT.md), [ADR 0025](adr/0025-scenes-are-components-under-a-static-namespace-no-custom-renderer.md), [ADR 0026](adr/0026-nested-fields-are-set-with-partial-values-not-dashed-props.md) and [the roadmap](roadmap.md). This file is a snapshot. Where it disagrees with the code or the roadmap, they win.

## Where things stand

- **Branch:** `feat/threejs`, 12 commits ahead of `main` (`5c572e5` … `b9a1017`). The working tree is clean. **Nothing is pushed** and there is no PR.
- **Done:** T0.01, T0.02, T1.01–T1.08, ticked in the roadmap with notes on how each was built.
- **Next:** **T1.09** `onFrame(cb)`. Do only that step (AGENTS.md: one roadmap step at a time, by ID).
- **Checks:** 89 tests (jsdom and Chromium), lint, format, typecheck and build all pass.

## How the user works

- **Never commit without asking.** When a step is done: tick its roadmap box (with a one- or two-sentence note on how it was built), run every check, **show the full drafted commit message in your reply**, then ask. Commit only on a yes. (Earlier, "commit with the drafted message" was asked twice without the draft being shown; don't repeat that.)
- Commit messages: `feat|fix|refactor|test|chore|docs: …` with the step ID in the subject, a prose body, and the `Co-Authored-By` trailer from the system prompt.
- The user decides design questions. When a step hides a real choice, lay out the options with a recommendation and wait. The user does push back: dashed Path props (T1.04) were replaced by Partial values after the user asked, recorded in ADR 0026.
- Never mention other UI or 3D libraries anywhere (docs, comments, tests, commits). Describe the library on its own terms.

## Commands

Run everything with mise's Node (24.20); the shell's Node 22.17 breaks lint.

```bash
eval "$(mise env -s zsh)"
```

- In `packages/threejs`: `pnpm typecheck`, `pnpm test` (both vitest projects), `pnpm vitest run --project unit|browser`, `pnpm build`, `node scripts/generate-t.mjs [--check]`.
- From the root: `pnpm lint` (the output is long because of existing `ui` warnings: redirect it to a file and grep for `threejs`) and `pnpm format:check`. Run `npx oxfmt packages/threejs` before checking.
- pnpm 12 has no `-s` flag.
- Browser tests leave `packages/threejs/.vitest/` (ignored); delete it after a failing run.

## Package map

- `src/canvas/canvas.tsx`: `Canvas`, `useCanvas()` (the `CanvasHandle`: `scene`, `camera`, `renderer()`, `size()`, `advance()`, `invalidate()`), and the exported `invalidate()` for every mounted Canvas. It provides `ParentContext` with `() => scene`.
- `src/canvas/frame-loop.ts`: the `requestAnimationFrame` scheduler (`demand` / `always` / `never`). **T1.09 extends this.**
- `src/scene-component/scene-component.tsx`: `sceneComponent(Class)`. The Instance is a memo: `ownedInstance` over `args` (compared by value; a re-run is a Rebuild, and its `onCleanup` disposes) or `adoptedInstance` over `object` (never disposed). After that come `bindProps`, an Attach render effect that follows `parent()`, a `swap` effect on Rebuild, and the ref (synchronous at mount, a deferred `createEffect` after a Rebuild).
- `src/scene-component/attach.ts`: Attach rules, plus `Attachment { swap, detach }`. Claims on one property stack per slot.
- `src/scene-component/props.ts`: `applyProp` (copy rules and Partial values) and `bindProps` (one named render effect per prop, Invalidating on every write; Partial values are re-applied when Attach fills their property).
- `src/t/components.gen.ts`: **generated**, don't edit. 97 `/* @__PURE__ */ sceneComponent(...)` calls, re-exported as `export * as T`.
- `test/harness.ts`: the stub renderer, the factories (`stubFactory`, `deferredFactory`) and a fake `ResizeObserver` with `resize()`. It's installed for jsdom only, by `test/jsdom-setup.ts`.
- Every topic has an LLM reference next to its source (`canvas.md`, `scene-component.md`), indexed in `src/llms.md`. `test/llms.test.ts` fails if a public export isn't mentioned in them, and `src/index.test.ts` pins the public API.

## Things learned the hard way

- **`createRenderEffect` runs its first apply synchronously**, so prop bindings use it: props are on the Instance before Attach and the ref. A plain `createEffect` applies later.
- **Return cleanups from `onSettled`**; calling `onCleanup` inside it halts the page. `onCleanup` is fine in a component body and inside memos (the Instance memo uses it to dispose).
- **Signal writes aren't readable until flush**, which is why Canvas keeps the renderer in a plain variable (`active`) alongside the signal.
- **TypeScript never checks JSX attributes with a dash** it doesn't know, which is why dashed props were dropped (ADR 0026).
- **oxlint false positives:** `ref={variable}` triggers `no-unassigned-vars` (turned off for threejs tests in `oxlint.config.ts`), and passing an accessor into a helper triggers `solid/reactivity`. Use `// oxlint-disable-next-line solid/reactivity -- reason`, as `bindProps` does, or restructure.
- **Fake animation frames:** `vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })` and `vi.advanceTimersToNextFrame()` (see `frame-loop.test.tsx`). Tests that count draws without the loop use `frameloop="never"`.
- **Re-run budgets** (`toStayWithinRerunBudget`) only set an upper bound. Pair them with an assertion that the change happened, and name scopes (`${Class.name}.${prop}`, `Canvas.*`) so budgets can target them.
- **Rolldown minifies strings to template literals,** so build-output checks match any quote style (`t-namespace.test.tsx`).
- **three's `exports` hide its `package.json`;** the generator reads `node_modules/three*/` directly.
- **`T` is the intersection of r186 and r171** (the `three-floor` dev alias, the peer minimum), minus the abstract `Light`. Four newer textures are reached only through `sceneComponent`. After a three upgrade, `pnpm generate` and review the diff.

## Behavior that is deliberate (don't "fix" it)

- At mount the ref runs before the children attach. After a Rebuild or a new `object`, it runs after they have moved.
- Partial values skip fields the current object lacks: a Mesh holds a `MeshBasicMaterial` until its child material attaches. TypeScript catches misspelled fields.
- Which props a component has is read once; their values are reactive. `attach` is read once.
- A component adopts when it has an `object` prop, decided once. `args` and `object` are exclusive in the types.
- The default camera's aspect ratio doesn't follow the canvas yet: that's T1.11.

## T1.09: what was decided, and what's left to decide

From the design session: Frame callbacks run in **registration order**, which follows the component tree. A parent's callback runs before its children's. Named phases were deferred ("Not in 0.0.1"). While at least one callback is registered, the Canvas renders continuously, and it returns to on-demand when the last one unregisters. Each callback belongs to the current reactive owner and unregisters when the owner is disposed. `onRender` (T1.10) is a separate step.

Still open; ask the user before building:

- **The callback's arguments.** The sketch was `onFrame((state, delta) => …)`. What is `state`: the `CanvasHandle`, or something with the clock time? Is `delta` in seconds or milliseconds?
- **What `advance()` passes as the time,** so tests can step Frames deterministically.
- **Whether a callback registered under `frameloop="never"` keeps rendering.** Probably not: `never` stays manual.

Implementation pointers: `onFrame` must be called inside a Canvas (it needs `useCanvas()`). The frame loop needs a callback count that keeps requesting frames while it's above zero, and the callbacks run in `tick` and in `advance()` before `render()`. Test with fake animation frames, and add a rerun-budget test showing that a running callback causes no reactive re-runs.

## Known gaps, tracked in the roadmap

- No CI runs the threejs tests yet (T3.03).
- The test harness is internal (`test/harness.ts`), not a public `testing` subpath.
- SSR isn't handled yet (T1.14): Scene components would run on the server.
