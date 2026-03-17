import { FlatCompat } from '@eslint/eslintrc';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const RESTRICTED_TYPE_DIRECTORY_IMPORT_MESSAGE =
  'Do not import from a types directory/barrel. Import the concrete `*.types.ts` module directly.';

const restrictedTypeDirectoryImports = [
  {
    name: '@/lib/ai/types',
    message: RESTRICTED_TYPE_DIRECTORY_IMPORT_MESSAGE,
  },
  {
    name: '@/lib/ai/types/index',
    message: RESTRICTED_TYPE_DIRECTORY_IMPORT_MESSAGE,
  },
  {
    name: '@/lib/api/types',
    message: RESTRICTED_TYPE_DIRECTORY_IMPORT_MESSAGE,
  },
  {
    name: '@/lib/api/types/index',
    message: RESTRICTED_TYPE_DIRECTORY_IMPORT_MESSAGE,
  },
  {
    name: '@/lib/db/queries/types',
    message: RESTRICTED_TYPE_DIRECTORY_IMPORT_MESSAGE,
  },
  {
    name: '@/lib/db/queries/types/index',
    message: RESTRICTED_TYPE_DIRECTORY_IMPORT_MESSAGE,
  },
  {
    name: '@/lib/types',
    message: RESTRICTED_TYPE_DIRECTORY_IMPORT_MESSAGE,
  },
  {
    name: '@/lib/types/index',
    message: RESTRICTED_TYPE_DIRECTORY_IMPORT_MESSAGE,
  },
];

const requestLayerRestrictedImports = [
  {
    name: '@/lib/db/drizzle',
    message:
      'Use getDb() from @/lib/db/runtime in request handlers for RLS enforcement. Service-role DB should only be used in workers.',
  },
];

// ── Layer enforcement patterns ──
// Architecture: shared (leaf) ← lib (infrastructure) ← features (domain)
const sharedLayerRestrictedPatterns = [
  {
    group: ['@/lib/*', '@/lib/**'],
    message:
      'shared/ must not import from lib/. Move the dependency to shared/ or use dependency injection.',
  },
  {
    group: ['@/features/*', '@/features/**'],
    message:
      'shared/ must not import from features/. Move the dependency to shared/ or use dependency injection.',
  },
];

const libLayerRestrictedPatterns = [
  {
    group: ['@/features/*', '@/features/**'],
    message:
      'lib/ must not import from features/. Extract shared types to shared/ or use dependency injection.',
  },
];

const restrictedTypeReexportSyntax = [
  {
    selector:
      "ImportDeclaration[source.value='@/lib/types/client'][importKind='type']",
    message:
      'Import types from @/lib/types/client.types. Keep @/lib/types/client for runtime exports like PLAN_STATUSES only.',
  },
  {
    selector:
      "ImportDeclaration[source.value='@/lib/types/client'] > ImportSpecifier[importKind='type']",
    message:
      'Import types from @/lib/types/client.types. Keep @/lib/types/client for runtime exports like PLAN_STATUSES only.',
  },
  {
    selector:
      "ImportDeclaration[source.value='@/lib/types/db'][importKind='type']",
    message:
      'Import types from @/lib/types/db.types. Keep @/lib/types/db for runtime exports like SKILL_LEVELS and PROGRESS_STATUSES only.',
  },
  {
    selector:
      "ImportDeclaration[source.value='@/lib/types/db'] > ImportSpecifier[importKind='type']",
    message:
      'Import types from @/lib/types/db.types. Keep @/lib/types/db for runtime exports like SKILL_LEVELS and PROGRESS_STATUSES only.',
  },
];

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
      '**/.next/**',
      '.worktrees/**',
      'out/**',
      'build/**',
      'coverage/**',
      'scripts/**',
      'next-env.d.ts',
      'eslint.config.*',
      'postcss.config.*',
      'tailwind.config.*',
      'next.config.*',
      'src/components/ui/**',
    ],
  },
  // Apply type-checked configs only to TS files to avoid
  // requiring type information for JS config files (e.g. lint-staged.config.js)
  ...typeCheckedConfigs.map((c) => ({
    ...c,
    files: ['**/*.{ts,tsx}'],
  })),
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
        ...restrictedTypeReexportSyntax,
      ],

      // Dont await in async functions for TS files since we are using Next.js
      '@typescript-eslint/require-await': 'warn',

      // TS + React common adjustments
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'no-console': 'error',
    },
  },
  {
    files: [
      'drizzle.config.ts',
      'vitest.config.ts',
      'sentry.edge.config.ts',
      'sentry.server.config.ts',
    ],
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
  {
    files: ['src/lib/logging/client.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // Allow console usage in CLI entry points
  {
    files: ['src/lib/db/*-cli.ts', 'src/scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: restrictedTypeDirectoryImports,
        },
      ],
    },
  },
  // Block service-role DB imports in request layers (use getDb() / RLS DB instead)
  // Note: System endpoints like health checks are excluded
  {
    files: [
      'src/app/api/v1/**',
      'src/app/**/actions.ts',
      'src/lib/api/**',
      'src/lib/integrations/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...restrictedTypeDirectoryImports,
            ...requestLayerRestrictedImports,
          ],
        },
      ],
    },
  },
  // ── Layer enforcement: shared/ must not import from lib/ or features/ ──
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: restrictedTypeDirectoryImports,
          patterns: sharedLayerRestrictedPatterns,
        },
      ],
    },
  },
  // Exception: DB-derived type files in shared/ that must import from lib/db
  // (inherent to Drizzle type derivation pattern)
  {
    files: [
      'src/shared/types/db.types.ts',
      'src/shared/types/client.types.ts',
      'src/shared/types/db.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: restrictedTypeDirectoryImports,
          patterns: [
            {
              group: ['@/features/*', '@/features/**'],
              message:
                'shared/ must not import from features/. Move the dependency to shared/ or use dependency injection.',
            },
          ],
        },
      ],
    },
  },
  // ── Layer enforcement: lib/ must not import from features/ ──
  {
    files: ['src/lib/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: restrictedTypeDirectoryImports,
          patterns: libLayerRestrictedPatterns,
        },
      ],
    },
  },
  // Re-apply request-layer restrictions for lib/api and lib/integrations
  // (must come after the general lib/ block to preserve both sets of rules)
  {
    files: ['src/lib/api/**/*.{ts,tsx}', 'src/lib/integrations/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...restrictedTypeDirectoryImports,
            ...requestLayerRestrictedImports,
          ],
          patterns: libLayerRestrictedPatterns,
        },
      ],
    },
  },
  // Exception: attempts.ts depends on features/plans/metrics (tracked by issue #245)
  {
    files: ['src/lib/db/queries/attempts.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: restrictedTypeDirectoryImports },
      ],
    },
  },
  // Exception: openapi.ts depends on features/plans/validation (Zod schema coupling)
  {
    files: ['src/lib/api/openapi.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...restrictedTypeDirectoryImports,
            ...requestLayerRestrictedImports,
          ],
        },
      ],
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
      'no-restricted-syntax': ['error', ...restrictedTypeReexportSyntax],
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
