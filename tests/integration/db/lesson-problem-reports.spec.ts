import {
  learningPlans,
  lessonProblemReports,
  tasks,
  users,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

/** One learner, one lesson, one report on it. */
async function createReportedLesson(suffix: string) {
  const authUserId = buildTestAuthUserId(`lesson-report-cascade-${suffix}`);
  const userId = await ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
  });
  const plan = await createTestPlan({ userId });
  const module = await createTestModule({ planId: plan.id });
  const task = await createTestTask({ moduleId: module.id });
  await db.insert(lessonProblemReports).values({
    userId,
    planId: plan.id,
    moduleId: module.id,
    taskId: task.id,
    reason: 'incorrect',
  });
  expect(await db.select().from(lessonProblemReports)).toHaveLength(1);
  return { userId, planId: plan.id, taskId: task.id };
}

describe('lesson_problem_reports cascades', () => {
  it('deletes the report with its lesson', async () => {
    const { taskId } = await createReportedLesson('task');

    await db.delete(tasks).where(eq(tasks.id, taskId));

    expect(await db.select().from(lessonProblemReports)).toHaveLength(0);
  });

  it('deletes the report with its plan', async () => {
    const { planId } = await createReportedLesson('plan');

    await db.delete(learningPlans).where(eq(learningPlans.id, planId));

    expect(await db.select().from(lessonProblemReports)).toHaveLength(0);
  });

  it('deletes the report with its user', async () => {
    const { userId } = await createReportedLesson('user');

    await db.delete(users).where(eq(users.id, userId));

    expect(await db.select().from(lessonProblemReports)).toHaveLength(0);
  });
});
