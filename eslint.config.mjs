import { FlatCompat } from '@eslint/eslintrc';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

// Use the recommended type-checked configs, but strip out the noisy
// @typescript-eslint/await-thenable rule entirely so it never gets applied.
const typeCheckedConfigs = tseslint.configs.recommendedTypeChecked.map((c) => {
  if (!('rules' in c) || !c.rules) return c;
  const entries = Object.entries(c.rules).filter(
    ([name]) => name !== '@typescript-eslint/await-thenable'
  );
  return { ...c, rules: Object.fromEntries(entries) };
});

export default [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'scripts/**',
      'next-env.d.ts',
      'eslint.config.*',
      'postcss.config.*',
      'tailwind.config.*',
      'next.config.*',
    ],
  },
  ...typeCheckedConfigs,
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

      // TS + React common adjustments
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
    },
  },
  {
    files: ['drizzle.config.ts', 'vitest.config.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        // Use the TS Project Service so typed rules work for standalone files
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
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
  // Relax rules for test files (must come after Next.js config)
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/require-await': 'off',
      '@next/next/no-assign-module-variable': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Turn off formatting-related rules to defer to Prettier
  eslintConfigPrettier,
];
