import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { glueTsConfig } from './plugin-gg.js';

/**
 * Base flat config for every package. `gluets` globs simulation code; `bots` globs a game's own bots, GlueTS too, which
 * may also use the platform's bot helpers (@gg/template-core).
 * @param {{ gluets?: string[], bots?: string[], browser?: boolean, node?: boolean, ignores?: string[] }} [opts]
 */
export function baseConfig(opts = {}) {
  const { gluets = [], bots = [], browser = false, node = true, ignores = [] } = opts;
  const langGlobals = {
    ...(node ? globals.node : {}),
    ...(browser ? globals.browser : {}),
  };
  const configs = [
    { ignores: ['dist/**', 'node_modules/**', '.next/**', 'coverage/**', ...ignores] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      languageOptions: { globals: langGlobals },
      rules: {
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        '@typescript-eslint/consistent-type-imports': 'error',
        'no-console': 'off',
      },
    },
  ];
  if (gluets.length > 0) configs.push(glueTsConfig(gluets));
  if (bots.length > 0) configs.push(glueTsConfig(bots, { allowImports: ['@gg/template-core'], name: 'gg/gluets-bots' }));
  return configs;
}

export default baseConfig;
