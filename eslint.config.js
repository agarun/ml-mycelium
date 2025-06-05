import { defineConfig, globalIgnores } from 'eslint/config';
import tsParser from '@typescript-eslint/parser';
import _import from 'eslint-plugin-import';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import { fixupPluginRules } from '@eslint/compat';
import globals from 'globals';
import parser from 'svelte-eslint-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  {
    files: ['**/*.{js,ts,cjs,svelte}'],
    extends: compat.extends(
      'eslint:recommended',
      'plugin:@typescript-eslint/strict-type-checked',
      'plugin:svelte/recommended',
      'prettier',
    ),

    languageOptions: {
      parser: tsParser,
      sourceType: 'module',
      ecmaVersion: 2020,

      parserOptions: {
        extraFileExtensions: ['.svelte'],
        project: ['./tsconfig.eslint.json'],
      },

      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },

    plugins: {
      import: fixupPluginRules(_import), // eslint-disable-line
      '@typescript-eslint': typescriptEslint,
    },

    rules: {
      eqeqeq: ['warn', 'always'],
      'import/extensions': [
        'warn',
        'never',
        {
          json: 'always',
          svelte: 'always',
        },
      ],
      'no-console': [
        'warn',
        {
          allow: ['info', 'warn', 'error', 'time', 'timeEnd'],
        },
      ],
      'no-constant-binary-expression': 'warn',
      '@typescript-eslint/no-deprecated': 'warn',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/restrict-template-expressions': [
        'warn',
        {
          allowNumber: true,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['**/*.svelte'],

    languageOptions: {
      parser: parser,

      parserOptions: {
        parser: '@typescript-eslint/parser',
      },
    },
  },
  globalIgnores([
    '**/.DS_Store',
    '**/node_modules',
    'build',
    'dist',
    'dist-app',
    '.svelte-kit',
    'package',
    '**/.env',
    '**/.env.*',
    '!**/.env.example',
    '**/.cicd/',
    '**/.pnpm-store/',
    '**/vite.config.js.timestamp-*',
    '**/vite.config.ts.timestamp-*',
    '**/.vscode',
    'gen',
    '**/pnpm-lock.yaml',
    '**/package-lock.json',
    '**/yarn.lock',
    // The changelog is generated automatically.
    '**/CHANGELOG.md',
    'static/docs',
    // The following files are automtically generated.
    'src/lib/loader/onnx/proto',
  ]),
]);
