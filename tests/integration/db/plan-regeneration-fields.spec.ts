import { learningPlans } from '@supabase/schema';
import { MAX_REGENERATION_NOTE_LENGTH } from '@supabase/schema/constants';
import { db } from '@supabase/service-role';
import { createTestPlan } from '@tests/fixtures/plans';
import { truncateAll } from '@tests/helpers/db/truncate';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

async function createPlanFixture(suffix: string) {
  const authUserId = buildTestAuthUserId(`regen-fields-${suffix}`);
  const userId = await ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
  });
  return createTestPlan({ userId, topic: 'Regeneration Fields Plan' });
}

describe('learning_plans regeneration fields', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('defaults both fields to null', async () => {
    const plan = await createPlanFixture('defaults');

    expect(plan.regenerationReasons).toBeNull();
    expect(plan.regenerationNote).toBeNull();
  });

  it('stores reason chips and a note up to the length limit', async () => {
    const plan = await createPlanFixture('round-trip');
    const note = 'x'.repeat(MAX_REGENERATION_NOTE_LENGTH);

    await db
      .update(learningPlans)
      .set({
        regenerationReasons: ['too_easy', 'more_practice'],
        regenerationNote: note,
      })
      .where(eq(learningPlans.id, plan.id));

    const [row] = await db
      .select({
        regenerationReasons: learningPlans.regenerationReasons,
        regenerationNote: learningPlans.regenerationNote,
      })
      .from(learningPlans)
      .where(eq(learningPlans.id, plan.id));

    expect(row).toEqual({
      regenerationReasons: ['too_easy', 'more_practice'],
      regenerationNote: note,
    });
  });

  it('rejects a note over the length limit', async () => {
    const plan = await createPlanFixture('too-long');

    await expect(
      db
        .update(learningPlans)
        .set({
          regenerationNote: 'x'.repeat(MAX_REGENERATION_NOTE_LENGTH + 1),
        })
        .where(eq(learningPlans.id, plan.id)),
    ).rejects.toMatchObject({
      cause: { constraint_name: 'learning_plans_regeneration_note_length' },
    });
  });
});
