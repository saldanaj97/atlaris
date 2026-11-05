import { expectRlsViolation } from './rls-test-helpers';
import { deletedPlanGenerationAttempts } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { truncateAll } from '@tests/helpers/db/truncate';
import { ensureUser } from '@tests/helpers/db/users';
import {
  cleanupTrackedRlsClients,
  createRlsDbForUser,
} from '@tests/helpers/rls';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('deleted plan generation attempts RLS', () => {
  beforeEach(async () => {
    await cleanupTrackedRlsClients();
    await truncateAll();
  });

  afterEach(async () => {
    await cleanupTrackedRlsClients();
  });

  it('lets owners read their own rows and blocks every write', async () => {
    const ownerAuthUserId = buildTestAuthUserId('deleted-attempts-owner');
    const otherAuthUserId = buildTestAuthUserId('deleted-attempts-other');
    const userId = await ensureUser({
      authUserId: ownerAuthUserId,
      email: buildTestEmail(ownerAuthUserId),
    });
    await ensureUser({
      authUserId: otherAuthUserId,
      email: buildTestEmail(otherAuthUserId),
    });
    const ownerDb = await createRlsDbForUser(ownerAuthUserId);
    const otherDb = await createRlsDbForUser(otherAuthUserId);
    const values = { userId, attemptCreatedAt: new Date() };
    const [inserted] = await db
      .insert(deletedPlanGenerationAttempts)
      .values(values)
      .returning();
    if (!inserted) throw new Error('Expected deleted plan attempt');

    await expect(
      ownerDb.select().from(deletedPlanGenerationAttempts),
    ).resolves.toHaveLength(1);
    await expect(
      otherDb.select().from(deletedPlanGenerationAttempts),
    ).resolves.toEqual([]);

    await expectRlsViolation(() =>
      ownerDb.insert(deletedPlanGenerationAttempts).values(values),
    );
    await expectRlsViolation(() =>
      ownerDb
        .update(deletedPlanGenerationAttempts)
        .set({ attemptCreatedAt: new Date(0) })
        .where(eq(deletedPlanGenerationAttempts.id, inserted.id)),
    );
    await expectRlsViolation(() =>
      ownerDb
        .delete(deletedPlanGenerationAttempts)
        .where(eq(deletedPlanGenerationAttempts.id, inserted.id)),
    );
  });
});
