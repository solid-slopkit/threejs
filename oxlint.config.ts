import { defineConfig } from 'oxlint';
import solidV2 from 'eslint-plugin-solid/configs/v2';

export default defineConfig({
  jsPlugins: ['eslint-plugin-solid'],
  ignorePatterns: ['**/*.gen.*', 'dist'],
  settings: solidV2.settings,
  rules: {
    ...solidV2.rules,
    // Functions that call what they're given in a scope of their own: loadAsset reads its URL in a memo, and Frame and
    // Render callbacks run outside rendering, like event handlers.
    'solid/reactivity': ['warn', { customReactiveFunctions: ['loadAsset', 'onFrame', 'onRender'] }],
  },
  overrides: [
    {
      // Tests and examples take Instances through `let mesh!: Mesh; <T.Mesh ref={mesh} />`, the form the docs teach:
      // the Solid compiler assigns the variable, which this rule can't see.
      files: ['packages/threejs/src/**/*.test.tsx', 'apps/docs/src/examples/**'],
      rules: { 'no-unassigned-vars': 'off' },
    },
  ],
});
