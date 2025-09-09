import { FlatCompat } from '@eslint/eslintrc';
import eslintConfigPrettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'eslint.config.*',
      'postcss.config.*',
      'tailwind.config.*',
      'next.config.*',
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    plugins: {
      'react-hooks': reactHooks,
      'import-x': importX,
    },
    settings: {
      // Teach import-x to parse TS and resolve TS paths/types
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx'],
      },
      'import/resolver': {
        typescript: {
          project: ['./tsconfig.json'],
          alwaysTryTypes: true,
        },
      },
      react: { version: 'detect' },
    },
    rules: {
      // Ensure proper usage of React Hooks and dependency checks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // Allow intentionally unused vars/args when prefixed with _
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      // Prefer const maps over enums; disallow enums
      '@typescript-eslint/prefer-enum-initializers': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'Use const object or as const array instead of enum.',
        },
      ],

      // Dont await in async functions for TS files since we are using Next.js
      '@typescript-eslint/require-await': 'warn',

      // Import correctness and hygiene
      'import-x/no-unresolved': 'error',
      'import-x/named': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/no-cycle': ['warn', { maxDepth: 1 }],
      'import-x/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // TS + React common adjustments
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
    },
  },
  // Disable require-await where Next.js expects async by convention
  {
    files: [
      'src/middleware.ts',
      'src/**/middleware.ts',
      'src/app/**/route.ts',
      'src/app/**/route.tsx',
      'src/utils/supabase/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },
  // Next.js recommended + Core Web Vitals via compat until flat config is fully supported upstream
  ...compat.extends('plugin:@next/next/core-web-vitals'),
  // Turn off formatting-related rules to defer to Prettier
  eslintConfigPrettier,
];
