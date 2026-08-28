import { reserveAttemptSlot } from '@/lib/db/queries/attempts';
import { GENERATION_PURPOSES } from '@/shared/types/generation-purpose';
import { generationAttempts, learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

async function createPlanForPurpose(
  scenario: string,
): Promise<{ planId: string; userId: string }> {
  const authUserId = buildTestAuthUserId(`purpose-${scenario}`);
  const userId = await ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
  });
  const plan = await createTestPlan({
    userId,
    topic: `Purpose ${scenario}`,
  });
  return { planId: plan.id, userId };
}

describe('generation_attempts generation purpose persistence', () => {
  it('stores the enum as a non-null queryable column with initial default', async () => {
    const rows = (await db.execute(sql`
      SELECT column_name, is_nullable, column_default, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'generation_attempts'
        AND column_name = 'generation_purpose'
    `)) as Array<{
      column_name: string;
      is_nullable: string;
      column_default: string | null;
      udt_name: string;
    }>;

    expect(rows).toEqual([
      {
        column_name: 'generation_purpose',
        is_nullable: 'NO',
        column_default: expect.stringContaining('initial'),
        udt_name: 'generation_purpose',
      },
    ]);

    const enumRows = (await db.execute(sql`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = 'generation_purpose'
      ORDER BY e.enumsortorder
    `)) as Array<{ enumlabel: string }>;
    expect(enumRows.map((row) => row.enumlabel)).toEqual([
      ...GENERATION_PURPOSES,
    ]);
  });

  it('round-trips initial and regeneration and defaults omitted inserts to initial', async () => {
    const { planId } = await createPlanForPurpose('round-trip');

    const [initialAttempt] = await db
      .insert(generationAttempts)
      .values({
        planId,
        status: 'success',
        durationMs: 1,
        modulesCount: 1,
        tasksCount: 1,
        generationPurpose: 'initial',
      })
      .returning({
        id: generationAttempts.id,
        generationPurpose: generationAttempts.generationPurpose,
      });

    const [regenerationAttempt] = await db
      .insert(generationAttempts)
      .values({
        planId,
        status: 'success',
        durationMs: 2,
        modulesCount: 1,
        tasksCount: 1,
        generationPurpose: 'regeneration',
      })
      .returning({
        id: generationAttempts.id,
        generationPurpose: generationAttempts.generationPurpose,
      });

    const [defaultedAttempt] = await db
      .insert(generationAttempts)
      .values({
        planId,
        status: 'failure',
        classification: 'timeout',
        durationMs: 3,
        modulesCount: 0,
        tasksCount: 0,
      })
      .returning({
        id: generationAttempts.id,
        generationPurpose: generationAttempts.generationPurpose,
      });

    expect(initialAttempt?.generationPurpose).toBe('initial');
    expect(regenerationAttempt?.generationPurpose).toBe('regeneration');
    expect(defaultedAttempt?.generationPurpose).toBe('initial');

    const persisted = await db
      .select({
        id: generationAttempts.id,
        generationPurpose: generationAttempts.generationPurpose,
      })
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, planId));

    expect(persisted).toEqual(
      expect.arrayContaining([
        {
          id: initialAttempt?.id,
          generationPurpose: 'initial',
        },
        {
          id: regenerationAttempt?.id,
          generationPurpose: 'regeneration',
        },
        {
          id: defaultedAttempt?.id,
          generationPurpose: 'initial',
        },
      ]),
    );
  });

  it('rejects invalid generation purpose values at the database', async () => {
    const { planId } = await createPlanForPurpose('invalid');

    await expect(
      db.execute(
        sql`INSERT INTO generation_attempts (
          plan_id,
          status,
          duration_ms,
          modules_count,
          tasks_count,
          generation_purpose
        ) VALUES (
          ${planId}::uuid,
          'success',
          1,
          1,
          1,
          'retry'
        )`,
      ),
    ).rejects.toThrow(/generation_purpose|invalid input value/i);

    const remaining = await db
      .select({ id: generationAttempts.id })
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, planId));
    expect(remaining).toEqual([]);

    const [plan] = await db
      .select({ id: learningPlans.id })
      .from(learningPlans)
      .where(eq(learningPlans.id, planId));
    expect(plan?.id).toBe(planId);
  });

  it('persists explicit purpose through attempt reservation for initial and regeneration', async () => {
    const reservationInput = {
      topic: 'Purpose reservation',
      skillLevel: 'beginner' as const,
      weeklyHours: 5,
      learningStyle: 'mixed' as const,
    };

    const initial = await createPlanForPurpose('reserve-initial');
    const regeneration = await createPlanForPurpose('reserve-regeneration');

    const initialReservation = await reserveAttemptSlot({
      planId: initial.planId,
      userId: initial.userId,
      input: reservationInput,
      generationPurpose: 'initial',
      dbClient: db,
    });
    const regenerationReservation = await reserveAttemptSlot({
      planId: regeneration.planId,
      userId: regeneration.userId,
      input: reservationInput,
      generationPurpose: 'regeneration',
      dbClient: db,
    });

    expect(initialReservation.reserved).toBe(true);
    expect(regenerationReservation.reserved).toBe(true);
    if (!initialReservation.reserved || !regenerationReservation.reserved) {
      throw new Error('Expected both reservations to succeed');
    }
    expect(initialReservation.generationPurpose).toBe('initial');
    expect(regenerationReservation.generationPurpose).toBe('regeneration');

    const [initialRow] = await db
      .select({
        generationPurpose: generationAttempts.generationPurpose,
      })
      .from(generationAttempts)
      .where(eq(generationAttempts.id, initialReservation.attemptId));
    const [regenerationRow] = await db
      .select({
        generationPurpose: generationAttempts.generationPurpose,
      })
      .from(generationAttempts)
      .where(eq(generationAttempts.id, regenerationReservation.attemptId));

    expect(initialRow?.generationPurpose).toBe('initial');
    expect(regenerationRow?.generationPurpose).toBe('regeneration');
  });
});
