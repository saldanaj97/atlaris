import { db as serviceRoleDb } from '@supabase/service-role';
import { vi } from 'vitest';

type CustomerProvisioningDbOverrides = Partial<{
  execute: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  updateWhere: ReturnType<typeof vi.fn>;
  updateReturning: ReturnType<typeof vi.fn>;
}>;

type WebhookEventDbOverrides = Partial<{
  insert: ReturnType<typeof vi.fn>;
  insertReturns: unknown[];
}>;

export function buildMockCustomerProvisioningDb(
  overrides: CustomerProvisioningDbOverrides = {},
): typeof serviceRoleDb {
  const execute = overrides.execute ?? vi.fn().mockResolvedValue([]);
  const limit = overrides.limit ?? vi.fn().mockResolvedValue([]);
  const updateReturning =
    overrides.updateReturning ?? vi.fn().mockResolvedValue([]);
  const updateWhere =
    overrides.updateWhere ??
    vi.fn(() => ({
      returning: updateReturning,
    }));

  return {
    transaction: vi.fn(async (callback) =>
      callback({
        execute,
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit,
            })),
          })),
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: updateWhere,
          })),
        })),
      }),
    ),
  } as unknown as typeof serviceRoleDb;
}

export function buildMockWebhookEventDb(
  overrides: WebhookEventDbOverrides = {},
): typeof serviceRoleDb {
  const returning = vi.fn().mockResolvedValue(overrides.insertReturns ?? []);
  const onConflictDoNothing = vi.fn(() => ({
    returning,
  }));
  const values = vi.fn(() => ({
    onConflictDoNothing,
    returning,
  }));

  return {
    insert:
      overrides.insert ??
      vi.fn(() => ({
        values,
      })),
  } as unknown as typeof serviceRoleDb;
}
