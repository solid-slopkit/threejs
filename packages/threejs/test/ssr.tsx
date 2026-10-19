// SSR and hydration test helper. A component's scenarios live in a fixtures module that exports
// functions returning JSX. The helper renders one scenario on the server and hydrates the HTML in
// the test's jsdom document, and reports every console message and thrown error from either side
// (Solid prints diagnostics and hydration mismatches to the console) and every element hydration
// replaced instead of reusing.
//
// Both halves are compiled by the helper's own Vite server, which runs the Solid plugin with
// `ssr: true` like an app's dev server does. Vitest's own transform can't be used for the client
// half: in test mode the plugin compiles non-hydratable code on purpose.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  createRunnableDevEnvironment,
  createServer,
  createServerModuleRunner,
  type Plugin,
  type RunnableDevEnvironment,
  type ViteDevServer,
} from 'vite';
import type { ModuleRunner } from 'vite/module-runner';
import solid from '@solidjs/vite-plugin';
import { afterAll, expect, vi } from 'vitest';

type Fixtures = Record<string, () => unknown>;

export interface HydrationResult {
  /** The server-rendered HTML. */
  html: string;
  /** The hydrated element, still in the document until `dispose` runs. */
  container: HTMLElement;
  /** Console messages and thrown errors while rendering on the server. */
  serverMessages: string[];
  /** Console messages and thrown errors while hydrating. */
  clientMessages: string[];
  /** Server-rendered elements that hydration did not reuse. */
  replaced: Element[];
  /** The client's `flush()`: the hydrated page runs on its own Solid instance. */
  flush: () => void;
  dispose: () => void;
}

let server: Promise<ViteDevServer> | undefined;

// Client builds import Vite's browser HMR client (for Solid's refresh), which opens a websocket. Nothing reloads
// here, so it is replaced with no-ops.
const stubViteClient: Plugin = {
  name: 'slopkit-test:stub-vite-client',
  enforce: 'pre',
  load: (id) =>
    id.endsWith('/vite/dist/client/client.mjs')
      ? `export const createHotContext = () => ({ accept() {}, dispose() {}, prune() {}, invalidate() {}, on() {}, off() {}, send() {}, data: {} });
export const updateStyle = () => {};
export const removeStyle = () => {};
export const injectQuery = (url) => url;`
      : undefined,
};

// The running test file. `import.meta.url` is not a file URL in the jsdom environment.
function testFile(): string {
  const path = expect.getState().testPath;
  if (!path) throw new Error('renderAndHydrate() must be called from inside a test.');
  return path;
}

// The nearest directory above the test file with a package.json.
function packageRoot(): string {
  let dir = dirname(testFile());
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`No package.json above ${testFile()}`);
    dir = parent;
  }
  return dir;
}

// One Vite server per test file: the `ssr` environment compiles for the server, the `hydrate`
// environment compiles the same modules for the browser. Compiled modules are shared by the file's
// renders; each render runs them in fresh module runners (below).
function viteServer(): Promise<ViteDevServer> {
  server ??= createServer({
    configFile: false,
    root: packageRoot(),
    mode: 'development',
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false },
    plugins: [stubViteClient, solid({ ssr: true })],
    environments: {
      hydrate: {
        consumer: 'client',
        // Run every dependency through Vite, as a browser would get it, instead of Node importing it,
        // and without pre-bundling, which would load a second copy of Solid next to the source one.
        resolve: { noExternal: true },
        optimizeDeps: { noDiscovery: true, include: [] },
        dev: {
          // Off by default for client environments; the module runner can only execute transformed code.
          moduleRunnerTransform: true,
          createEnvironment: (name, config) => createRunnableDevEnvironment(name, config),
        },
      },
    },
  });
  return server;
}

afterAll(async () => {
  if (!server) return;
  const vite = await server;
  server = undefined;
  await vite.close();
});

// Fresh module instances for one render: an error that halts one render's Solid instance must not
// halt the next render's.
function runner(vite: ViteDevServer, environment: 'ssr' | 'hydrate'): ModuleRunner {
  return createServerModuleRunner(vite.environments[environment] as RunnableDevEnvironment, { hmr: false });
}

async function capture<T>(run: () => T | Promise<T>): Promise<[T | undefined, string[]]> {
  const messages: string[] = [];
  const record = (...args: unknown[]) => void messages.push(args.map(String).join(' '));
  const spies = (['error', 'warn', 'log', 'info'] as const).map((level) => vi.spyOn(console, level).mockImplementation(record));
  try {
    return [await run(), messages];
  } catch (error) {
    messages.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    return [undefined, messages];
  } finally {
    spies.forEach((spy) => spy.mockRestore());
  }
}

/**
 * Renders `fixtures[name]` on the server, then hydrates it in the jsdom document. `fixturesPath` is the
 * fixtures module's path relative to the test file, e.g. `'./button.fixtures.tsx'`.
 */
export async function renderAndHydrate(fixturesPath: string, name: string): Promise<HydrationResult> {
  const vite = await viteServer();
  const file = resolve(dirname(testFile()), fixturesPath);
  const serverRunner = runner(vite, 'ssr');
  const clientRunner = runner(vite, 'hydrate');
  const closeRunners = () => Promise.all([serverRunner.close(), clientRunner.close()]);

  const serverWeb = await serverRunner.import('@solidjs/web');
  const serverFixtures: Fixtures = await serverRunner.import(file);
  if (!(name in serverFixtures)) {
    await closeRunners();
    throw new Error(`No fixture named "${name}" in ${file}`);
  }

  const [html = '', serverMessages] = await capture<string>(() => serverWeb.renderToString(() => serverFixtures[name]!()));

  // What an app's <head> carries: the runtime hydrate() reads (`_$HY`). Fresh for every render.
  delete (globalThis as { _$HY?: unknown })._$HY;
  const head = document.createElement('template');
  head.innerHTML = serverWeb.generateHydrationScript();
  for (const script of head.content.querySelectorAll('script')) new Function(script.textContent ?? '')();

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.append(container);
  const serverElements = [...container.querySelectorAll('*')];

  // The client half is a second Solid instance next to the one the test process loaded; it is
  // separate on purpose, so Solid's duplicate-instance warning (a global flag) is suppressed for it.
  const solidLoaded = (globalThis as { Solid$$?: boolean }).Solid$$;
  delete (globalThis as { Solid$$?: boolean }).Solid$$;
  const clientSolid = await clientRunner.import('solid-js');
  const clientWeb = await clientRunner.import('@solidjs/web');
  const clientFixtures: Fixtures = await clientRunner.import(file);
  (globalThis as { Solid$$?: boolean }).Solid$$ = solidLoaded;

  const [dispose, clientMessages] = await capture<() => void>(() => {
    const dispose = clientWeb.hydrate(() => clientFixtures[name]!(), container);
    clientSolid.flush();
    return dispose;
  });

  const hydrated = new Set(container.querySelectorAll('*'));
  const replaced = serverElements.filter((element) => !hydrated.has(element));

  return {
    html,
    container,
    serverMessages,
    clientMessages,
    replaced,
    flush: () => clientSolid.flush(),
    dispose: () => {
      dispose?.();
      container.remove();
      void closeRunners();
    },
  };
}

/** Asserts that `fixtures[name]` renders on the server and hydrates cleanly: no messages, nothing replaced. */
export async function expectHydration(fixturesPath: string, name: string): Promise<void> {
  const result = await renderAndHydrate(fixturesPath, name);
  try {
    expect(result.html, 'server render').not.toBe('');
    expect(result.serverMessages, 'console messages and errors during the server render').toEqual([]);
    expect(result.clientMessages, 'console messages and errors during hydration').toEqual([]);
    expect(
      result.replaced.map((element) => element.outerHTML.slice(0, 80)),
      'server-rendered elements that hydration replaced',
    ).toEqual([]);
  } finally {
    result.dispose();
  }
}
