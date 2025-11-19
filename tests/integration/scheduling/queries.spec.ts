import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { db } from '@/lib/db/service-role';
import { learningPlans, planSchedules, users } from '@/lib/db/schema';
import {
  getPlanScheduleCache,
  upsertPlanScheduleCache,
} from '@/lib/db/queries/schedules';
import type { ScheduleJson } from '@/lib/scheduling/types';
import { eq } from 'drizzle-orm';

describe('Schedule Queries', () => {
  let testUserId: string;
  let testPlanId: string;

  beforeEach(async () => {
    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: `test-clerk-${Date.now()}`,
        email: `test-${Date.now()}@example.com`,
        name: 'Test User',
      })
      .returning();
    testUserId = user.id;

    // Create test plan
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: testUserId,
        topic: 'Test Topic',
        skillLevel: 'beginner',
        weeklyHours: 10,
        learningStyle: 'mixed',
        generationStatus: 'ready',
      })
      .returning();
    testPlanId = plan.id;
  });

  afterEach(async () => {
    // Cleanup
    await db.delete(planSchedules).where(eq(planSchedules.planId, testPlanId));
    await db.delete(learningPlans).where(eq(learningPlans.id, testPlanId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  describe('getPlanScheduleCache', () => {
    it('should return null for non-existent cache', async () => {
      const result = await getPlanScheduleCache(testPlanId);
      expect(result).toBeNull();
    });

    it('should retrieve existing cache', async () => {
      const scheduleJson: ScheduleJson = {
        weeks: [
          {
            weekNumber: 1,
            startDate: '2025-02-03',
            endDate: '2025-02-09',
            days: [
              {
                dayNumber: 1,
                date: '2025-02-03',
                sessions: [
                  {
                    taskId: 'task-1',
                    taskTitle: 'Task 1',
                    estimatedMinutes: 60,
                    moduleId: 'mod-1',
                    moduleName: 'Module 1',
                  },
                ],
              },
            ],
          },
        ],
        totalWeeks: 1,
        totalSessions: 1,
      };

      await db.insert(planSchedules).values({
        planId: testPlanId,
        scheduleJson,
        inputsHash: 'test-hash-123',
        timezone: 'UTC',
        weeklyHours: 10,
        startDate: '2025-02-03',
        deadline: null,
      });

      const result = await getPlanScheduleCache(testPlanId);
      expect(result).not.toBeNull();
      expect(result?.scheduleJson).toEqual(scheduleJson);
      expect(result?.inputsHash).toBe('test-hash-123');
    });
  });

  describe('upsertPlanScheduleCache', () => {
    it('should insert new cache entry', async () => {
      const scheduleJson: ScheduleJson = {
        weeks: [],
        totalWeeks: 0,
        totalSessions: 0,
      };

      await upsertPlanScheduleCache(testPlanId, {
        scheduleJson,
        inputsHash: 'hash-456',
        timezone: 'America/New_York',
        weeklyHours: 5,
        startDate: '2025-02-10',
        deadline: '2025-03-10',
      });

      const result = await getPlanScheduleCache(testPlanId);
      expect(result).not.toBeNull();
      expect(result?.inputsHash).toBe('hash-456');
    });

    it('should update existing cache entry', async () => {
      // Insert initial cache
      await db.insert(planSchedules).values({
        planId: testPlanId,
        scheduleJson: { weeks: [], totalWeeks: 0, totalSessions: 0 },
        inputsHash: 'old-hash',
        timezone: 'UTC',
        weeklyHours: 10,
        startDate: '2025-02-03',
        deadline: null,
      });

      // Update cache
      const newScheduleJson: ScheduleJson = {
        weeks: [
          {
            weekNumber: 1,
            startDate: '2025-02-03',
            endDate: '2025-02-09',
            days: [],
          },
        ],
        totalWeeks: 1,
        totalSessions: 0,
      };

      await upsertPlanScheduleCache(testPlanId, {
        scheduleJson: newScheduleJson,
        inputsHash: 'new-hash',
        timezone: 'UTC',
        weeklyHours: 10,
        startDate: '2025-02-03',
        deadline: null,
      });

      const result = await getPlanScheduleCache(testPlanId);
      expect(result?.inputsHash).toBe('new-hash');
      expect(result?.scheduleJson).toEqual(newScheduleJson);
    });
  });
});
