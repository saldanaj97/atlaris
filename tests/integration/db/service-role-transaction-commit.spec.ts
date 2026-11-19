import { buildTestPlanInsert } from '../../fixtures/plans';
import { ensureUser } from '../../helpers/db/users';
import { learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const SERVICE_ROLE_POOL_SIZE = 10;

/**
 * Hosted POSTGRES_URL is Supavisor transaction mode, which can run a transaction
 * on a backend that lacks the client's cached named statements. With named
 * statements, postgres-js re-prepared the failed `commit` inside the aborted
 * transaction, Postgres answered ROLLBACK without an error, and the write was
 * silently lost (the staging "plan created, then not found" 503).
 * `DEALLOCATE ALL` inside the transaction stands in for the pooler handing the
 * transaction a backend without this connection's statements.
 */
describe('service-role transaction commit', () => {
  it('keeps the write of a transaction that resolved', async () => {
    const authUserId = `auth-${randomUUID()}`;
    const userId = await ensureUser({
      authUserId,
      email: `${authUserId}@example.com`,
    });

    // Open every pooled connection and run a commit on each, so any cached
    // `commit` statement exists on whichever connection the next transaction uses.
    await Promise.all(
      Array.from({ length: SERVICE_ROLE_POOL_SIZE }, () =>
        db.transaction(async (tx) => {
          await tx.execute(sql`select pg_sleep(0.05)`);
        }),
      ),
    );

    const committedPlanId = await db.transaction(async (tx) => {
      const [plan] = await tx
        .insert(learningPlans)
        .values(buildTestPlanInsert(userId, { topic: 'Commit survival' }))
        .returning({ id: learningPlans.id });
      await tx.execute(sql`deallocate all`);
      return plan?.id;
    });

    if (!committedPlanId) {
      throw new Error('insert returned no plan id');
    }
    const rows = await db
      .select({ id: learningPlans.id })
      .from(learningPlans)
      .where(eq(learningPlans.id, committedPlanId));
    expect(rows).toHaveLength(1);
  });
});
