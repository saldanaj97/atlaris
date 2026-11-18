import { expectRlsViolation } from './rls-test-helpers';
import { lessonProblemReports } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { truncateAll } from '@tests/helpers/db/truncate';
import { ensureUser } from '@tests/helpers/db/users';
import {
  cleanupTrackedRlsClients,
  createRlsDbForUser,
} from '@tests/helpers/rls';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

async function createLearner(suffix: string) {
  const authUserId = buildTestAuthUserId(`lesson-report-${suffix}`);
  const userId = await ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
  });
  const plan = await createTestPlan({ userId, topic: 'Report Plan' });
  const module = await createTestModule({ planId: plan.id });
  const task = await createTestTask({ moduleId: module.id });

  return {
    authUserId,
    userId,
    report: {
      userId,
      planId: plan.id,
      moduleId: module.id,
      taskId: task.id,
    },
  };
}

describe('lesson_problem_reports RLS', () => {
  beforeEach(async () => {
    await cleanupTrackedRlsClients();
    await truncateAll();
  });

  afterEach(async () => {
    await cleanupTrackedRlsClients();
  });

  it('lets the owner insert, read and replace their own report', async () => {
    const owner = await createLearner('owner');
    const ownerDb = await createRlsDbForUser(owner.authUserId);

    const [inserted] = await ownerDb
      .insert(lessonProblemReports)
      .values({ ...owner.report, reason: 'incorrect', note: 'Wrong year' })
      .returning();
    expect(inserted?.reason).toBe('incorrect');

    await ownerDb
      .insert(lessonProblemReports)
      .values({ ...owner.report, reason: 'unclear', note: null })
      .onConflictDoUpdate({
        target: [lessonProblemReports.taskId, lessonProblemReports.userId],
        set: { reason: 'unclear', note: null },
      });

    const rows = await ownerDb.select().from(lessonProblemReports);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: inserted?.id,
      reason: 'unclear',
      note: null,
    });
  });

  it("rejects a report on another user's lesson, even under the reporter's own user id", async () => {
    const owner = await createLearner('victim');
    const attacker = await createLearner('attacker');
    const attackerDb = await createRlsDbForUser(attacker.authUserId);

    await expectRlsViolation(() =>
      attackerDb.insert(lessonProblemReports).values({
        ...owner.report,
        userId: attacker.userId,
        reason: 'other',
      }),
    );
    await expectRlsViolation(() =>
      attackerDb
        .insert(lessonProblemReports)
        .values({ ...owner.report, reason: 'other' }),
    );

    const rows = await db.select().from(lessonProblemReports);
    expect(rows).toHaveLength(0);
  });

  it('rejects an inconsistent plan, module and lesson triple', async () => {
    const owner = await createLearner('triple');
    const ownerDb = await createRlsDbForUser(owner.authUserId);
    const otherPlan = await createTestPlan({
      userId: owner.userId,
      topic: 'Second plan',
    });
    const otherModule = await createTestModule({ planId: otherPlan.id });

    await expectRlsViolation(() =>
      ownerDb.insert(lessonProblemReports).values({
        ...owner.report,
        moduleId: otherModule.id,
        reason: 'incorrect',
      }),
    );
    await expectRlsViolation(() =>
      ownerDb.insert(lessonProblemReports).values({
        ...owner.report,
        planId: otherPlan.id,
        reason: 'incorrect',
      }),
    );
  });

  it("hides and protects another user's report", async () => {
    const owner = await createLearner('reader');
    const other = await createLearner('snooper');
    const [report] = await db
      .insert(lessonProblemReports)
      .values({ ...owner.report, reason: 'incorrect', note: 'Owner note' })
      .returning();
    if (!report) throw new Error('Expected a report row');
    const otherDb = await createRlsDbForUser(other.authUserId);

    expect(await otherDb.select().from(lessonProblemReports)).toHaveLength(0);

    const updated = await otherDb
      .update(lessonProblemReports)
      .set({ reason: 'other', note: 'Overwritten' })
      .where(eq(lessonProblemReports.id, report.id))
      .returning();
    expect(updated).toHaveLength(0);

    await expectRlsViolation(() =>
      otherDb
        .delete(lessonProblemReports)
        .where(eq(lessonProblemReports.id, report.id)),
    );

    const [after] = await db
      .select()
      .from(lessonProblemReports)
      .where(eq(lessonProblemReports.id, report.id));
    expect(after).toMatchObject({ reason: 'incorrect', note: 'Owner note' });
  });

  it('lets the owner change only the report fields and never delete', async () => {
    const owner = await createLearner('columns');
    const [report] = await db
      .insert(lessonProblemReports)
      .values({ ...owner.report, reason: 'incorrect' })
      .returning();
    if (!report) throw new Error('Expected a report row');
    const ownerDb = await createRlsDbForUser(owner.authUserId);
    const otherTask = await createTestTask({
      moduleId: owner.report.moduleId,
      order: 2,
    });

    await expectRlsViolation(() =>
      ownerDb
        .update(lessonProblemReports)
        .set({ taskId: otherTask.id })
        .where(eq(lessonProblemReports.id, report.id)),
    );
    await expectRlsViolation(() =>
      ownerDb
        .delete(lessonProblemReports)
        .where(eq(lessonProblemReports.id, report.id)),
    );

    expect(await db.select().from(lessonProblemReports)).toHaveLength(1);
  });
});
