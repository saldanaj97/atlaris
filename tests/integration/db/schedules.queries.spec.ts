import { describe, expect, it, beforeEach } from 'vitest';

import { db } from '@/lib/db/drizzle';
import {
  getPlanScheduleCache,
  upsertPlanScheduleCache,
  deletePlanScheduleCache,
} from '@/lib/db/queries/schedules';
import { learningPlans } from '@/lib/db/schema';
import { ensureUser } from '../../helpers/db';
import type { ScheduleCacheRow } from '@/lib/scheduling/types';

describe('Schedule Queries', () => {
  let userId: string;
  let planId: string;

  beforeEach(async () => {
    // Create a user and plan for testing
    userId = await ensureUser({
      clerkUserId: 'clerk_schedule_test_user',
      email: 'scheduletest@example.com',
    });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Test Schedule Plan',
        skillLevel: 'intermediate',
        weeklyHours: 10,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
        generationStatus: 'ready',
      })
      .returning();

    planId = plan.id;
  });

  describe('upsertPlanScheduleCache', () => {
    it('should insert a new schedule cache', async () => {
      const scheduleData = {
        scheduleJson: { weeks: [{ weekNumber: 1, tasks: [] }] } as ScheduleCacheRow['scheduleJson'],
        inputsHash: 'hash123',
        timezone: 'America/New_York',
        weeklyHours: 10,
        startDate: '2024-01-01',
        deadline: '2024-12-31',
      };

      await upsertPlanScheduleCache(planId, scheduleData);

      // Verify the cache was created
      const cache = await getPlanScheduleCache(planId);

      expect(cache).not.toBeNull();
      expect(cache?.planId).toBe(planId);
      expect(cache?.inputsHash).toBe('hash123');
      expect(cache?.timezone).toBe('America/New_York');
      expect(cache?.weeklyHours).toBe(10);
      expect(cache?.startDate).toBe('2024-01-01');
      expect(cache?.deadline).toBe('2024-12-31');
    });

    it('should update existing schedule cache on conflict', async () => {
      const initialData = {
        scheduleJson: { weeks: [{ weekNumber: 1, tasks: [] }] } as ScheduleCacheRow['scheduleJson'],
        inputsHash: 'hash123',
        timezone: 'America/New_York',
        weeklyHours: 10,
        startDate: '2024-01-01',
        deadline: '2024-12-31',
      };

      // Insert initial cache
      await upsertPlanScheduleCache(planId, initialData);

      // Update with new data
      const updatedData = {
        scheduleJson: { weeks: [{ weekNumber: 1, tasks: [] }, { weekNumber: 2, tasks: [] }] } as ScheduleCacheRow['scheduleJson'],
        inputsHash: 'hash456',
        timezone: 'America/Los_Angeles',
        weeklyHours: 15,
        startDate: '2024-02-01',
        deadline: '2024-11-30',
      };

      await upsertPlanScheduleCache(planId, updatedData);

      // Verify the cache was updated
      const cache = await getPlanScheduleCache(planId);

      expect(cache).not.toBeNull();
      expect(cache?.inputsHash).toBe('hash456');
      expect(cache?.timezone).toBe('America/Los_Angeles');
      expect(cache?.weeklyHours).toBe(15);
      expect(cache?.startDate).toBe('2024-02-01');
      expect(cache?.deadline).toBe('2024-11-30');
    });

    it('should handle null deadline', async () => {
      const scheduleData = {
        scheduleJson: { weeks: [] } as ScheduleCacheRow['scheduleJson'],
        inputsHash: 'hash_no_deadline',
        timezone: 'UTC',
        weeklyHours: 5,
        startDate: '2024-01-01',
        deadline: null,
      };

      await upsertPlanScheduleCache(planId, scheduleData);

      const cache = await getPlanScheduleCache(planId);

      expect(cache).not.toBeNull();
      expect(cache?.deadline).toBeNull();
    });

    it('should update generatedAt timestamp on upsert', async () => {
      const scheduleData = {
        scheduleJson: { weeks: [] } as ScheduleCacheRow['scheduleJson'],
        inputsHash: 'hash_timestamp',
        timezone: 'UTC',
        weeklyHours: 10,
        startDate: '2024-01-01',
        deadline: '2024-12-31',
      };

      // Insert
      await upsertPlanScheduleCache(planId, scheduleData);
      const firstCache = await getPlanScheduleCache(planId);
      const firstTimestamp = firstCache?.generatedAt;

      // Wait a bit and update
      await new Promise((resolve) => setTimeout(resolve, 10));

      await upsertPlanScheduleCache(planId, {
        ...scheduleData,
        inputsHash: 'hash_timestamp_updated',
      });

      const updatedCache = await getPlanScheduleCache(planId);
      const updatedTimestamp = updatedCache?.generatedAt;

      expect(firstTimestamp).toBeInstanceOf(Date);
      expect(updatedTimestamp).toBeInstanceOf(Date);
      expect(updatedTimestamp!.getTime()).toBeGreaterThan(firstTimestamp!.getTime());
    });
  });

  describe('getPlanScheduleCache', () => {
    it('should return null for non-existent schedule cache', async () => {
      const cache = await getPlanScheduleCache('non-existent-plan-id');

      expect(cache).toBeNull();
    });

    it('should retrieve existing schedule cache', async () => {
      const scheduleData = {
        scheduleJson: {
          weeks: [
            { weekNumber: 1, tasks: ['task1', 'task2'] },
            { weekNumber: 2, tasks: ['task3'] },
          ],
        } as ScheduleCacheRow['scheduleJson'],
        inputsHash: 'complex_hash',
        timezone: 'Europe/London',
        weeklyHours: 20,
        startDate: '2024-03-01',
        deadline: '2024-09-01',
      };

      await upsertPlanScheduleCache(planId, scheduleData);

      const cache = await getPlanScheduleCache(planId);

      expect(cache).not.toBeNull();
      expect(cache?.scheduleJson).toEqual(scheduleData.scheduleJson);
    });

    it('should return correct cache when multiple plans have schedules', async () => {
      // Create another plan
      const [plan2] = await db
        .insert(learningPlans)
        .values({
          userId,
          topic: 'Second Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
          generationStatus: 'ready',
        })
        .returning();

      // Create schedules for both plans
      await upsertPlanScheduleCache(planId, {
        scheduleJson: { weeks: [] } as ScheduleCacheRow['scheduleJson'],
        inputsHash: 'plan1_hash',
        timezone: 'UTC',
        weeklyHours: 10,
        startDate: '2024-01-01',
        deadline: null,
      });

      await upsertPlanScheduleCache(plan2.id, {
        scheduleJson: { weeks: [] } as ScheduleCacheRow['scheduleJson'],
        inputsHash: 'plan2_hash',
        timezone: 'America/New_York',
        weeklyHours: 5,
        startDate: '2024-02-01',
        deadline: null,
      });

      // Retrieve specific plan's cache
      const cache1 = await getPlanScheduleCache(planId);
      const cache2 = await getPlanScheduleCache(plan2.id);

      expect(cache1?.inputsHash).toBe('plan1_hash');
      expect(cache2?.inputsHash).toBe('plan2_hash');
    });
  });

  describe('deletePlanScheduleCache', () => {
    it('should delete existing schedule cache', async () => {
      // Create a schedule cache
      await upsertPlanScheduleCache(planId, {
        scheduleJson: { weeks: [] } as ScheduleCacheRow['scheduleJson'],
        inputsHash: 'to_delete_hash',
        timezone: 'UTC',
        weeklyHours: 10,
        startDate: '2024-01-01',
        deadline: null,
      });

      // Verify it exists
      let cache = await getPlanScheduleCache(planId);
      expect(cache).not.toBeNull();

      // Delete it
      await deletePlanScheduleCache(planId);

      // Verify it's gone
      cache = await getPlanScheduleCache(planId);
      expect(cache).toBeNull();
    });

    it('should not throw error when deleting non-existent cache', async () => {
      // Should not throw
      await expect(deletePlanScheduleCache('non-existent-plan')).resolves.not.toThrow();
    });

    it('should only delete specified plan\'s cache', async () => {
      // Create another plan
      const [plan2] = await db
        .insert(learningPlans)
        .values({
          userId,
          topic: 'Second Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
          generationStatus: 'ready',
        })
        .returning();

      // Create schedules for both plans
      await upsertPlanScheduleCache(planId, {
        scheduleJson: { weeks: [] } as ScheduleCacheRow['scheduleJson'],
        inputsHash: 'plan1_hash',
        timezone: 'UTC',
        weeklyHours: 10,
        startDate: '2024-01-01',
        deadline: null,
      });

      await upsertPlanScheduleCache(plan2.id, {
        scheduleJson: { weeks: [] } as ScheduleCacheRow['scheduleJson'],
        inputsHash: 'plan2_hash',
        timezone: 'UTC',
        weeklyHours: 5,
        startDate: '2024-02-01',
        deadline: null,
      });

      // Delete only first plan's cache
      await deletePlanScheduleCache(planId);

      // Verify first is gone, second remains
      const cache1 = await getPlanScheduleCache(planId);
      const cache2 = await getPlanScheduleCache(plan2.id);

      expect(cache1).toBeNull();
      expect(cache2).not.toBeNull();
      expect(cache2?.inputsHash).toBe('plan2_hash');
    });
  });

  describe('Schedule Cache Integrity', () => {
    it('should preserve complex JSON structure in scheduleJson', async () => {
      const complexSchedule = {
        weeks: [
          {
            weekNumber: 1,
            tasks: [
              { id: 'task1', title: 'Task 1', duration: 60 },
              { id: 'task2', title: 'Task 2', duration: 30 },
            ],
          },
          {
            weekNumber: 2,
            tasks: [
              { id: 'task3', title: 'Task 3', duration: 45 },
            ],
          },
        ],
        metadata: {
          totalHours: 2.25,
          difficulty: 'intermediate',
        },
      } as ScheduleCacheRow['scheduleJson'];

      await upsertPlanScheduleCache(planId, {
        scheduleJson: complexSchedule,
        inputsHash: 'complex_json_hash',
        timezone: 'UTC',
        weeklyHours: 10,
        startDate: '2024-01-01',
        deadline: null,
      });

      const cache = await getPlanScheduleCache(planId);

      expect(cache?.scheduleJson).toEqual(complexSchedule);
    });

    it('should handle different timezone formats', async () => {
      const timezones = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];

      for (const timezone of timezones) {
        // Create a new plan for each timezone test
        const [plan] = await db
          .insert(learningPlans)
          .values({
            userId,
            topic: `Plan for ${timezone}`,
            skillLevel: 'intermediate',
            weeklyHours: 10,
            learningStyle: 'mixed',
            visibility: 'private',
            origin: 'ai',
            generationStatus: 'ready',
          })
          .returning();

        await upsertPlanScheduleCache(plan.id, {
          scheduleJson: { weeks: [] } as ScheduleCacheRow['scheduleJson'],
          inputsHash: `hash_${timezone}`,
          timezone,
          weeklyHours: 10,
          startDate: '2024-01-01',
          deadline: null,
        });

        const cache = await getPlanScheduleCache(plan.id);
        expect(cache?.timezone).toBe(timezone);
      }
    });
  });
});
