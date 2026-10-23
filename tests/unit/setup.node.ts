// Node-level unit setup shared by the `unit` (node) and `unit-dom` (jsdom)
// Vitest projects: env defaults plus the hoisted module mocks. DOM-only setup
// lives in ./setup.ts.
import { beforeEach, vi } from 'vitest';

import '../setup/test-env';

// Set NODE_ENV to 'test' if not already set
if (!process.env.NODE_ENV) {
  Object.assign(process.env, { NODE_ENV: 'test' });
}

// Sonner must be mocked from setup (hoisted). Side-effect imports of a mock
// module are not hoisted and break toast spies.
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
  Toaster: () => null,
}));

vi.mock('@/lib/logging/client', () => ({
  clientLogger: {
    error: vi.fn((...args: unknown[]) =>
      (console.error ?? console.log)(...args),
    ),
    warn: vi.fn((...args: unknown[]) => (console.warn ?? console.log)(...args)),
    info: vi.fn((...args: unknown[]) => (console.info ?? console.log)(...args)),
    debug: vi.fn((...args: unknown[]) =>
      (console.debug ?? console.log)(...args),
    ),
  },
}));

// Tier model lists come from the guardrail fixture, reseeded before each test.
vi.mock('@/features/ai/model-catalog/store', async () => {
  const { inMemoryModelCatalogStore } =
    await import('../fixtures/ai-model-catalog');
  return {
    selectTierModels: vi.fn(inMemoryModelCatalogStore.selectTierModels),
    selectCatalogModel: vi.fn(inMemoryModelCatalogStore.selectCatalogModel),
    replaceTierModels: vi.fn(inMemoryModelCatalogStore.replaceTierModels),
  };
});

beforeEach(async () => {
  const { seedModelCatalogFixture } =
    await import('../fixtures/ai-model-catalog');
  // The state module imports no logger or env, so specs that mock env stay safe.
  const { resetModelCatalogStateForTests } =
    await import('@/features/ai/model-catalog/catalog-state');
  seedModelCatalogFixture();
  resetModelCatalogStateForTests();
});

// Prevent unit tests from importing a real DB client.
// This avoids requiring POSTGRES_URL in unit test runs and catches accidental DB usage.
vi.mock('@supabase/service-role', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@supabase/service-role')>();

  const crud = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  };

  let db: Record<PropertyKey, unknown>;
  const transaction = vi.fn(
    (fn: (tx: Record<PropertyKey, unknown>) => Promise<unknown>) => fn(db),
  );

  db = {
    [actual.SERVICE_ROLE_DB_MARKER]: true,
    ...crud,
    transaction,
    query: {
      learningPlans: {
        findFirst: vi.fn(),
      },
    },
  };

  return {
    ...actual,
    client: { end: vi.fn() },
    db,
    serviceRoleDb: {
      select: vi.fn(),
      insert: vi.fn(),
    },
  };
});
