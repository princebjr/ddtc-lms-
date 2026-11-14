import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import noHardCodedDesignValues from './eslint-rules/no-hard-coded-design-values.js';

const ddtc = { rules: { 'no-hard-coded-design-values': noHardCodedDesignValues } };

export default [
  {
    ignores: [
      'node_modules/',
      'dist/',
      'dist-e2e/',
      'dist-shots/',
      'dist-perf/',
      'dev-dist/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      '.lighthouseci/',
      'supabase/functions/',
      'docs/prototype/',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Design tokens only in components and pages (CLAUDE.md section 3, DESIGN.md 17).
    files: ['src/components/**/*.{js,jsx}', 'src/pages/**/*.{js,jsx}'],
    plugins: { ddtc },
    rules: { 'ddtc/no-hard-coded-design-values': 'error' },
  },
  {
    files: ['scripts/**/*.{js,mjs}', 'tests/**/*.{js,jsx,mjs}', 'eslint-rules/**/*.js', '*.{js,cjs,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.node },
    },
  },
  {
    // Playwright specs run in Node, but page.evaluate() callbacks run in the browser;
    // component tests run in jsdom.
    files: ['tests/e2e/**/*.js', 'tests/unit/**/*.{js,jsx}', 'tests/setup/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ['*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error', 'log'] }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
    },
  },
];
