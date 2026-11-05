import { getPlanFreeRouterFallback } from '@/lib/db/queries/plan-free-router-fallback';
import {
  createAnonymousRlsClient,
  createAuthenticatedRlsClient,
} from '@supabase/rls';
import { generationAttempts, learningPlans } from '@supabase/schema';
import { db as serviceDb } from '@supabase/service-role';
import { createTestPlan } from '@tests/fixtures/plans';
import { truncateAll } from '@tests/helpers/db/truncate';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function connectionErrorCode(error: unknown): unknown {
  let current = error;
  while (current instanceof Error) {
    if ('code' in current) return current.code;
    current = current.cause;
  }
  return undefined;
}

/** The query must fail because the client ended, not return rows or a permission error. */
async function expectClientEnded(query: PromiseLike<unknown>): Promise<void> {
  const outcome = await Promise.resolve(query).then(
    (result) => ({ settled: 'resolved' as const, result }),
    (error: unknown) => ({
      settled: 'rejected' as const,
      code: connectionErrorCode(error),
    }),
  );
  expect(outcome).toEqual({
    settled: 'rejected',
    code: expect.stringMatching(/^CONNECTION_(ENDED|DESTROYED)$/),
  });
}

type RlsClient = Awaited<ReturnType<typeof createAuthenticatedRlsClient>>;

async function killBackend(client: Pick<RlsClient, 'db'>): Promise<void> {
  const [row] = await client.db.execute<{ pid: number }>(
    sql`SELECT pg_backend_pid() AS pid`,
  );
  await serviceDb.execute(sql`SELECT pg_terminate_backend(${row?.pid})`);
}

describe('RLS client after losing its connection', () => {
  let authA: string;
  let planA: string;
  let planB: string;
  let client: RlsClient | undefined;

  beforeEach(async () => {
    await truncateAll();
    authA = buildTestAuthUserId('rls-connection-a');
    const authB = buildTestAuthUserId('rls-connection-b');
    const userA = await ensureUser({
      authUserId: authA,
      email: buildTestEmail(authA),
    });
    const userB = await ensureUser({
      authUserId: authB,
      email: buildTestEmail(authB),
    });
    planA = (await createTestPlan({ userId: userA, topic: 'A plan' })).id;
    planB = (await createTestPlan({ userId: userB, topic: 'B plan' })).id;
    await serviceDb.insert(generationAttempts).values({
      planId: planB,
      status: 'success',
      generationPurpose: 'initial',
      classification: null,
      durationMs: 1,
      modulesCount: 1,
      tasksCount: 1,
      truncatedTopic: false,
      truncatedNotes: false,
      normalizedEffort: false,
      promptHash: null,
      metadata: { provider: { freeRouterFallback: 'true' } },
    });
  });

  afterEach(async () => {
    await client?.cleanup();
    client = undefined;
  });

  it('runs a fresh client as the authenticated user', async () => {
    client = await createAuthenticatedRlsClient(authA);

    const [identity] = await client.db.execute<{ role: string }>(
      sql`SELECT current_user AS role`,
    );
    const visible = await client.db
      .select({ id: learningPlans.id })
      .from(learningPlans);

    expect(identity?.role).toBe('authenticated');
    expect(visible.map((row) => row.id)).toEqual([planA]);
  });

  it('rejects reads after the idle timeout closes the connection', async () => {
    client = await createAuthenticatedRlsClient(authA, { idleTimeout: 1 });
    await sleep(2_500);

    await expectClientEnded(client.db.select().from(learningPlans));
  });

  it('rejects reads after the backend is killed', async () => {
    client = await createAuthenticatedRlsClient(authA);
    await killBackend(client);
    await sleep(200);

    await expectClientEnded(client.db.select().from(learningPlans));
  });

  it("cannot change another user's plan after the connection closes", async () => {
    client = await createAuthenticatedRlsClient(authA, { idleTimeout: 1 });
    await sleep(2_500);

    await expectClientEnded(
      client.db
        .update(learningPlans)
        .set({ topic: 'changed by another user' })
        .where(eq(learningPlans.id, planB)),
    );

    const [row] = await serviceDb
      .select({ topic: learningPlans.topic })
      .from(learningPlans)
      .where(eq(learningPlans.id, planB));
    expect(row?.topic).toBe('B plan');
  });

  it('keeps an RLS-only helper from reading another user plan', async () => {
    client = await createAuthenticatedRlsClient(authA, { idleTimeout: 1 });
    const before = await getPlanFreeRouterFallback(planB, client.db);
    expect(before.outline).toBe(false);
    await sleep(2_500);

    await expectClientEnded(getPlanFreeRouterFallback(planB, client.db));
  });

  it('rejects a query queued behind a transaction when the backend dies', async () => {
    client = await createAuthenticatedRlsClient(authA);
    const [row] = await client.db.execute<{ pid: number }>(
      sql`SELECT pg_backend_pid() AS pid`,
    );

    // The transaction holds the only connection, so the outside query waits in the
    // driver's queue. A close would otherwise reconnect to run it as the owner role.
    const transactionOutcome = client.db
      .transaction(async () => {
        await sleep(1_000);
      })
      .then(
        () => 'resolved',
        () => 'rejected',
      );
    await sleep(200);
    const queuedCheck = expectClientEnded(
      client.db.select().from(learningPlans),
    );
    await sleep(50);
    await serviceDb.execute(sql`SELECT pg_terminate_backend(${row?.pid})`);

    await queuedCheck;
    await expect(transactionOutcome).resolves.toBe('rejected');
    await expectClientEnded(client.db.select().from(learningPlans));
  });

  it('still cleans up after the connection closes', async () => {
    client = await createAuthenticatedRlsClient(authA);
    await killBackend(client);
    await sleep(200);

    await expect(client.cleanup()).resolves.toBeUndefined();
  });

  it('ends an anonymous client the same way', async () => {
    const anonymous = await createAnonymousRlsClient();
    try {
      await killBackend(anonymous);
      await sleep(200);

      await expectClientEnded(anonymous.db.select().from(learningPlans));
    } finally {
      await anonymous.cleanup();
    }
  });
});
