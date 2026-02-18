import { beforeEach, describe, expect, it } from 'vitest';

import {
  getPlanScheduleCache,
  upsertPlanScheduleCache,
  validatePlanOwnership,
} from '@/lib/db/queries/schedules';
import type { UpsertPlanScheduleCachePayload } from '@/lib/db/queries/types/schedule.types';
import { db } from '@/lib/db/service-role';
import type { ScheduleJson } from '@/lib/scheduling/types';
import { createTestPlan } from '@tests/fixtures/plans';
import { createTestUser } from '@tests/fixtures/users';
import { resetDbForIntegrationTestFile } from '@tests/helpers/db';

function buildScheduleJson(
  overrides: Partial<ScheduleJson> = {}
): ScheduleJson {
  return {
    weeks: [
      {
        weekNumber: 1,
        startDate: '2026-02-02',
        endDate: '2026-02-08',
        days: [
          {
            dayNumber: 1,
            date: '2026-02-02',
            sessions: [
              {
                taskId: 'task-1',
                taskTitle: 'Task 1',
                estimatedMinutes: 45,
                moduleId: 'module-1',
                moduleName: 'Module 1',
              },
            ],
          },
        ],
      },
    ],
    totalWeeks: 1,
    totalSessions: 1,
    ...overrides,
  };
}

function buildSchedulePayload(
  overrides: Partial<UpsertPlanScheduleCachePayload> = {}
): UpsertPlanScheduleCachePayload {
  return {
    scheduleJson: buildScheduleJson(),
    inputsHash: 'hash-initial',
    timezone: 'UTC',
    weeklyHours: 8,
    startDate: '2026-02-02',
    deadline: '2026-04-01',
    ...overrides,
  };
}

describe('Schedule Queries', () => {
  let ownerId: string;
  let unauthorizedUserId: string;
  let planId: string;

  beforeEach(async () => {
    await resetDbForIntegrationTestFile();

    const owner = await createTestUser();
    const unauthorizedUser = await createTestUser();

    ownerId = owner.id;
    unauthorizedUserId = unauthorizedUser.id;

    const plan = await createTestPlan({
      userId: ownerId,
      topic: 'Schedule Cache Plan',
      weeklyHours: 8,
      generationStatus: 'ready',
    });

    planId = plan.id;
  });

  describe('validatePlanOwnership', () => {
    it('passes for the owner', async () => {
      await expect(
        validatePlanOwnership(planId, ownerId, db)
      ).resolves.toBeUndefined();
    });

    it('throws when plan is not owned by the user', async () => {
      await expect(
        validatePlanOwnership(planId, unauthorizedUserId, db)
      ).rejects.toThrow('Plan not found or access denied');
    });
  });

  describe('getPlanScheduleCache', () => {
    it('returns null when cache does not exist for an owned plan', async () => {
      const cache = await getPlanScheduleCache(planId, ownerId);

      expect(cache).toBeNull();
    });

    it('throws when user does not own the plan', async () => {
      await expect(
        getPlanScheduleCache(planId, unauthorizedUserId)
      ).rejects.toThrow('Plan not found or access denied');
    });
  });

  describe('upsertPlanScheduleCache', () => {
    it('inserts and retrieves schedule cache for the owner', async () => {
      const payload = buildSchedulePayload();

      await upsertPlanScheduleCache(planId, ownerId, payload);

      const cache = await getPlanScheduleCache(planId, ownerId);

      expect(cache).not.toBeNull();
      expect(cache?.planId).toBe(planId);
      expect(cache?.inputsHash).toBe(payload.inputsHash);
      expect(cache?.timezone).toBe(payload.timezone);
      expect(cache?.weeklyHours).toBe(payload.weeklyHours);
      expect(cache?.startDate).toBe(payload.startDate);
      expect(cache?.deadline).toBe(payload.deadline);
      expect(cache?.scheduleJson).toEqual(payload.scheduleJson);
    });

    it('updates existing cache entry on conflict', async () => {
      await upsertPlanScheduleCache(planId, ownerId, buildSchedulePayload());

      const updatedPayload = buildSchedulePayload({
        scheduleJson: buildScheduleJson({
          totalWeeks: 2,
          totalSessions: 2,
          weeks: [
            {
              weekNumber: 1,
              startDate: '2026-02-02',
              endDate: '2026-02-08',
              days: [],
            },
            {
              weekNumber: 2,
              startDate: '2026-02-09',
              endDate: '2026-02-15',
              days: [],
            },
          ],
        }),
        inputsHash: 'hash-updated',
        timezone: 'America/New_York',
        weeklyHours: 12,
        startDate: '2026-02-09',
        deadline: null,
      });

      await upsertPlanScheduleCache(planId, ownerId, updatedPayload);

      const cache = await getPlanScheduleCache(planId, ownerId);

      expect(cache).not.toBeNull();
      expect(cache?.inputsHash).toBe('hash-updated');
      expect(cache?.timezone).toBe('America/New_York');
      expect(cache?.weeklyHours).toBe(12);
      expect(cache?.startDate).toBe('2026-02-09');
      expect(cache?.deadline).toBeNull();
      expect(cache?.scheduleJson.totalWeeks).toBe(2);
      expect(cache?.scheduleJson.totalSessions).toBe(2);
    });

    it('throws when user does not own the plan', async () => {
      await expect(
        upsertPlanScheduleCache(
          planId,
          unauthorizedUserId,
          buildSchedulePayload()
        )
      ).rejects.toThrow('Plan not found or access denied');
    });
  });
});
