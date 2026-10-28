import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { glueTsConfig } from './plugin-gg.js';

/**
 * Base flat config for every package.
 * @param {{ gluets?: string[], browser?: boolean, node?: boolean, ignores?: string[] }} [opts]
 */
export function baseConfig(opts = {}) {
  const { gluets = [], browser = false, node = true, ignores = [] } = opts;
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
  return configs;
}

export default baseConfig;
