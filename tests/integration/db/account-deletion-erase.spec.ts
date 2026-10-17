import {
  applyClerkUserProjectionSource,
  clerkUserDeletionProjectionSource,
  clerkUserProjectionSourceFromWebhook,
  USER_SCOPED_ERASE_TABLES,
} from '@/features/auth/clerk-user-projection';
import { executeRows } from '@/lib/db/execute-rows';
import {
  learningPlans,
  oauthStateTokens,
  taskProgress,
  usageMetrics,
  userPreferences,
  users,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq, getTableName, sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

function logger() {
  return { info: vi.fn(), warn: vi.fn() };
}

let userForeignKeyTablesPromise: Promise<string[]> | undefined;

function userForeignKeyTables(): Promise<string[]> {
  userForeignKeyTablesPromise ??= queryUserForeignKeyTables();
  return userForeignKeyTablesPromise;
}

async function queryUserForeignKeyTables(): Promise<string[]> {
  const rows = await executeRows<{ table_name: string }>(
    db,
    sql`
    SELECT DISTINCT tc.table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'users'
      AND ccu.column_name = 'id'
      AND tc.table_name <> 'users'
    ORDER BY tc.table_name
  `,
  );
  return rows.map((row) => row.table_name);
}

async function seedAccountData(name: string) {
  const authUserId = buildTestAuthUserId(name);
  const userId = await ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
    name: 'Erase Fixture',
  });
  const plan = await createTestPlan({ userId });
  const learningModule = await createTestModule({ planId: plan.id });
  const task = await createTestTask({ moduleId: learningModule.id });
  await db.insert(taskProgress).values({ taskId: task.id, userId });
  await db.insert(userPreferences).values({ userId });
  await db.insert(usageMetrics).values({ userId, month: '2026-10' });
  await db.insert(oauthStateTokens).values({
    stateTokenHash: `hash_${authUserId}`,
    authUserId,
    expiresAt: new Date(Date.now() + 600_000),
  });
  return { authUserId, userId };
}

async function rowCounts(userId: string, authUserId: string) {
  const counts: Record<string, number> = {};
  for (const table of await userForeignKeyTables()) {
    const [row] = await executeRows<{ count: number }>(
      db,
      sql`SELECT count(*)::int AS count FROM ${sql.identifier(table)} WHERE user_id = ${userId}`,
    );
    counts[table] = row?.count ?? -1;
  }
  const [tokens] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(oauthStateTokens)
    .where(eq(oauthStateTokens.authUserId, authUserId));
  counts.oauth_state_tokens = tokens?.count ?? -1;
  return counts;
}

describe('account deletion erase', () => {
  it('erases from every table with a foreign key to users', async () => {
    expect(USER_SCOPED_ERASE_TABLES.map(getTableName).sort()).toEqual(
      await userForeignKeyTables(),
    );
  });

  it('erases data left behind by a reconciliation tombstone and spares other users', async () => {
    const target = await seedAccountData('erase-target');
    const bystander = await seedAccountData('erase-bystander');
    const bystanderBefore = await rowCounts(
      bystander.userId,
      bystander.authUserId,
    );
    expect(Object.values(bystanderBefore).some((count) => count > 0)).toBe(
      true,
    );

    await db.transaction((tx) =>
      applyClerkUserProjectionSource(
        clerkUserDeletionProjectionSource(target.authUserId),
        { db: tx, logger: logger() },
      ),
    );
    const plansAfterReconciliation = await db
      .select({ id: learningPlans.id })
      .from(learningPlans)
      .where(eq(learningPlans.userId, target.userId));
    expect(plansAfterReconciliation).toHaveLength(1);

    const source = clerkUserProjectionSourceFromWebhook({
      type: 'user.deleted',
      data: { id: target.authUserId },
    } as never);
    if (!source) throw new Error('expected a deletion source');
    await expect(
      db.transaction((tx) =>
        applyClerkUserProjectionSource(source, { db: tx, logger: logger() }),
      ),
    ).resolves.toBe('skipped_deleted_user');

    const after = await rowCounts(target.userId, target.authUserId);
    expect(Object.values(after).every((count) => count === 0)).toBe(true);
    await expect(
      db
        .select({
          email: users.email,
          name: users.name,
          clerkDeletedAt: users.clerkDeletedAt,
        })
        .from(users)
        .where(eq(users.id, target.userId)),
    ).resolves.toEqual([
      { email: null, name: null, clerkDeletedAt: expect.any(Date) },
    ]);

    await expect(
      rowCounts(bystander.userId, bystander.authUserId),
    ).resolves.toEqual(bystanderBefore);
    await expect(
      db
        .select({
          email: users.email,
          name: users.name,
          clerkDeletedAt: users.clerkDeletedAt,
        })
        .from(users)
        .where(eq(users.id, bystander.userId)),
    ).resolves.toEqual([
      {
        email: buildTestEmail(bystander.authUserId),
        name: 'Erase Fixture',
        clerkDeletedAt: null,
      },
    ]);
  });
});
