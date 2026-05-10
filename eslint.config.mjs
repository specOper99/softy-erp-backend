// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

// Load custom rules
const customRules = {
  'no-unsafe-tenant-context': (await import('./eslint-rules/no-unsafe-tenant-context.js')).default,
};

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/**', 'coverage/**', 'node_modules/**', 'reports/**', 'report/**', 'logs/**', 'eslint-rules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir,
        EXPERIMENTAL_useProjectService: true,
      },
    },
    plugins: {
      'local-rules': {
        rules: customRules,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { disallowTypeAnnotations: false }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
      'eqeqeq': ['error', 'always', { 'null': 'ignore' }],
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-console': ['error', { allow: ['warn', 'error', 'info', 'debug'] }],

      // Custom security rules
      'local-rules/no-unsafe-tenant-context': 'error',

      // Enforce toErrorMessage() helper instead of verbose instanceof patterns
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ConditionalExpression[test.type="BinaryExpression"][test.operator="instanceof"][test.right.name="Error"][consequent.type="MemberExpression"][consequent.property.name="message"]',
          message: 'Use toErrorMessage(error) from common/utils/error.util instead of manual instanceof Error checks.',
        },
      ],
    },
  },
  // Relaxed rules for test files - mocks commonly use any types and load helpers log to console
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  // Scripts and CI tools commonly log to stdout/stderr.
  {
    files: ['scripts/**/*.{ts,js}', 'load-tests/**/*.{ts,js}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  },
);
