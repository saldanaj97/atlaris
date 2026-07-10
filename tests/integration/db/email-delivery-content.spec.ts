import {
  findEmailDailyReminderPlanForUser,
  listEmailActivityDayKeysForUser,
} from '@/lib/db/queries/email-delivery-content';
import { setTaskProgressBatch } from '@/lib/db/queries/tasks';
import { learningActivityEvents } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { describe, expect, it } from 'vitest';

describe('email delivery content queries', () => {
  it('returns distinct local day keys within an inclusive/exclusive window', async () => {
    const authUserId = buildTestAuthUserId('email-content-days');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const otherAuth = buildTestAuthUserId('email-content-days-other');
    const otherUserId = await ensureUser({
      authUserId: otherAuth,
      email: buildTestEmail(otherAuth),
    });

    const plan = await createTestPlan({ userId, topic: 'windowed activity' });
    const module = await createTestModule({ planId: plan.id, order: 1 });
    const task = await createTestTask({ moduleId: module.id, order: 1 });

    await db.insert(learningActivityEvents).values([
      {
        userId,
        planId: plan.id,
        moduleId: module.id,
        taskId: task.id,
        status: 'completed',
        taskEstimatedMinutes: 30,
        occurredAt: new Date('2026-07-08T05:00:00.000Z'),
      },
      {
        userId,
        planId: plan.id,
        moduleId: module.id,
        taskId: task.id,
        status: 'completed',
        taskEstimatedMinutes: 30,
        occurredAt: new Date('2026-07-08T16:00:00.000Z'),
      },
      {
        userId,
        planId: plan.id,
        moduleId: module.id,
        taskId: task.id,
        status: 'completed',
        taskEstimatedMinutes: 30,
        occurredAt: new Date('2026-07-09T05:00:00.000Z'),
      },
      {
        userId: otherUserId,
        planId: plan.id,
        moduleId: module.id,
        taskId: task.id,
        status: 'completed',
        taskEstimatedMinutes: 30,
        occurredAt: new Date('2026-07-08T12:00:00.000Z'),
      },
    ]);

    const dayKeys = await listEmailActivityDayKeysForUser({
      userId,
      timeZone: 'America/Chicago',
      startDateKeyInclusive: '2026-07-08',
      endDateKeyExclusive: '2026-07-09',
      dbClient: db,
    });

    expect(dayKeys).toEqual(['2026-07-08']);
  });

  it('returns one deterministic incomplete ready plan and excludes completed plans', async () => {
    const authUserId = buildTestAuthUserId('email-content-plan');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });

    const older = await createTestPlan({
      userId,
      topic: 'older incomplete',
      createdAt: new Date('2026-07-01T12:00:00.000Z'),
    });
    const olderModule = await createTestModule({ planId: older.id, order: 1 });
    await createTestTask({ moduleId: olderModule.id, order: 1 });
    await createTestTask({ moduleId: olderModule.id, order: 2 });

    const newer = await createTestPlan({
      userId,
      topic: 'newer incomplete',
      createdAt: new Date('2026-07-08T12:00:00.000Z'),
    });
    const newerModule = await createTestModule({ planId: newer.id, order: 1 });
    await createTestTask({ moduleId: newerModule.id, order: 1 });
    await createTestTask({ moduleId: newerModule.id, order: 2 });

    const completed = await createTestPlan({
      userId,
      topic: 'completed plan',
      createdAt: new Date('2026-07-09T12:00:00.000Z'),
    });
    const completedModule = await createTestModule({
      planId: completed.id,
      order: 1,
    });
    const completedTask = await createTestTask({
      moduleId: completedModule.id,
      order: 1,
    });
    await setTaskProgressBatch(
      userId,
      [{ taskId: completedTask.id, status: 'completed' }],
      db,
    );

    const plan = await findEmailDailyReminderPlanForUser(userId, db);
    expect(plan).toEqual({
      id: newer.id,
      topic: 'newer incomplete',
      totalTasks: 2,
      completedTasks: 0,
    });
  });
});
