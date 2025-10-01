import { describe, expect, it } from 'vitest';

import { db } from '@/lib/db/drizzle';
import {
  getModulesWithTasksByPlanIds,
  getProgressByPlanIds,
} from '@/lib/db/queries';
import { learningPlans, modules, taskProgress, tasks } from '@/lib/db/schema';
import { ensureUser } from '../helpers/db';
import { setTestUser } from '../helpers/auth';

describe('Batch Query Optimization', () => {
  describe('getModulesWithTasksByPlanIds', () => {
    it('returns empty array when given no plan IDs', async () => {
      setTestUser('batch_empty_plan_user');
      const userId = await ensureUser({
        clerkUserId: 'batch_empty_plan_user',
        email: 'batch_empty_plan@example.com',
      });

      const result = await getModulesWithTasksByPlanIds(userId, []);
      expect(result).toEqual([]);
    });

    it('returns modules with nested tasks for single plan', async () => {
      setTestUser('batch_single_plan_user');
      const userId = await ensureUser({
        clerkUserId: 'batch_single_plan_user',
        email: 'batch_single@example.com',
      });

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId,
          topic: 'Single Plan Test',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
        })
        .returning();

      const insertedModules = await db
        .insert(modules)
        .values([
          {
            planId: plan.id,
            order: 1,
            title: 'Module 1',
            description: 'First module',
            estimatedMinutes: 60,
          },
          {
            planId: plan.id,
            order: 2,
            title: 'Module 2',
            description: 'Second module',
            estimatedMinutes: 90,
          },
        ])
        .returning();

      await db.insert(tasks).values([
        {
          moduleId: insertedModules[0].id,
          order: 1,
          title: 'Task 1-1',
          description: 'First task of module 1',
          estimatedMinutes: 30,
        },
        {
          moduleId: insertedModules[0].id,
          order: 2,
          title: 'Task 1-2',
          description: 'Second task of module 1',
          estimatedMinutes: 30,
        },
        {
          moduleId: insertedModules[1].id,
          order: 1,
          title: 'Task 2-1',
          description: 'First task of module 2',
          estimatedMinutes: 45,
        },
      ]);

      const result = await getModulesWithTasksByPlanIds(userId, [plan.id]);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Module 1');
      expect(result[0].tasks).toHaveLength(2);
      expect(result[1].title).toBe('Module 2');
      expect(result[1].tasks).toHaveLength(1);
    });

    it('returns modules with nested tasks for multiple plans', async () => {
      setTestUser('batch_multi_plan_user');
      const userId = await ensureUser({
        clerkUserId: 'batch_multi_plan_user',
        email: 'batch_multi@example.com',
      });

      const plans = await db
        .insert(learningPlans)
        .values([
          {
            userId,
            topic: 'Plan A',
            skillLevel: 'beginner',
            weeklyHours: 5,
            learningStyle: 'reading',
            visibility: 'private',
            origin: 'ai',
          },
          {
            userId,
            topic: 'Plan B',
            skillLevel: 'intermediate',
            weeklyHours: 10,
            learningStyle: 'video',
            visibility: 'private',
            origin: 'ai',
          },
        ])
        .returning();

      const insertedModules = await db
        .insert(modules)
        .values([
          {
            planId: plans[0].id,
            order: 1,
            title: 'Plan A Module 1',
            description: 'Module for plan A',
            estimatedMinutes: 60,
          },
          {
            planId: plans[1].id,
            order: 1,
            title: 'Plan B Module 1',
            description: 'Module for plan B',
            estimatedMinutes: 90,
          },
          {
            planId: plans[1].id,
            order: 2,
            title: 'Plan B Module 2',
            description: 'Second module for plan B',
            estimatedMinutes: 120,
          },
        ])
        .returning();

      await db.insert(tasks).values([
        {
          moduleId: insertedModules[0].id,
          order: 1,
          title: 'Plan A Task',
          description: 'Task for plan A',
          estimatedMinutes: 30,
        },
        {
          moduleId: insertedModules[1].id,
          order: 1,
          title: 'Plan B Module 1 Task',
          description: 'Task for plan B module 1',
          estimatedMinutes: 45,
        },
        {
          moduleId: insertedModules[2].id,
          order: 1,
          title: 'Plan B Module 2 Task',
          description: 'Task for plan B module 2',
          estimatedMinutes: 60,
        },
      ]);

      const planIds = plans.map((p) => p.id);
      const result = await getModulesWithTasksByPlanIds(userId, planIds);

      expect(result).toHaveLength(3);

      const planAModules = result.filter((m) => m.planId === plans[0].id);
      const planBModules = result.filter((m) => m.planId === plans[1].id);

      expect(planAModules).toHaveLength(1);
      expect(planBModules).toHaveLength(2);
      expect(planAModules[0].tasks).toHaveLength(1);
      expect(planBModules[0].tasks).toHaveLength(1);
      expect(planBModules[1].tasks).toHaveLength(1);
    });

    it('maintains correct ordering of modules and tasks', async () => {
      setTestUser('batch_ordering_user');
      const userId = await ensureUser({
        clerkUserId: 'batch_ordering_user',
        email: 'batch_ordering@example.com',
      });

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId,
          topic: 'Ordering Test',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
        })
        .returning();

      const insertedModules = await db
        .insert(modules)
        .values([
          {
            planId: plan.id,
            order: 3,
            title: 'Module 3',
            description: 'Third module',
            estimatedMinutes: 60,
          },
          {
            planId: plan.id,
            order: 1,
            title: 'Module 1',
            description: 'First module',
            estimatedMinutes: 90,
          },
          {
            planId: plan.id,
            order: 2,
            title: 'Module 2',
            description: 'Second module',
            estimatedMinutes: 120,
          },
        ])
        .returning();

      await db.insert(tasks).values([
        {
          moduleId: insertedModules[1].id,
          order: 2,
          title: 'Task 1-2',
          description: 'Second task',
          estimatedMinutes: 30,
        },
        {
          moduleId: insertedModules[1].id,
          order: 1,
          title: 'Task 1-1',
          description: 'First task',
          estimatedMinutes: 30,
        },
      ]);

      const result = await getModulesWithTasksByPlanIds(userId, [plan.id]);

      expect(result).toHaveLength(3);
      expect(result[0].order).toBe(1);
      expect(result[1].order).toBe(2);
      expect(result[2].order).toBe(3);

      expect(result[0].tasks).toHaveLength(2);
      expect(result[0].tasks[0].order).toBe(1);
      expect(result[0].tasks[1].order).toBe(2);
    });

    it('handles plans with no modules', async () => {
      setTestUser('batch_no_modules_user');
      const userId = await ensureUser({
        clerkUserId: 'batch_no_modules_user',
        email: 'batch_no_modules@example.com',
      });

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId,
          topic: 'Empty Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
        })
        .returning();

      const result = await getModulesWithTasksByPlanIds(userId, [plan.id]);
      expect(result).toEqual([]);
    });

    it('handles modules with no tasks', async () => {
      setTestUser('batch_no_tasks_user');
      const userId = await ensureUser({
        clerkUserId: 'batch_no_tasks_user',
        email: 'batch_no_tasks@example.com',
      });

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId,
          topic: 'Plan With Empty Module',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
        })
        .returning();

      await db.insert(modules).values({
        planId: plan.id,
        order: 1,
        title: 'Empty Module',
        description: 'Module with no tasks',
        estimatedMinutes: 60,
      });

      const result = await getModulesWithTasksByPlanIds(userId, [plan.id]);

      expect(result).toHaveLength(1);
      expect(result[0].tasks).toEqual([]);
    });

    it('groups tasks correctly by moduleId', async () => {
      setTestUser('batch_grouping_user');
      const userId = await ensureUser({
        clerkUserId: 'batch_grouping_user',
        email: 'batch_grouping@example.com',
      });

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId,
          topic: 'Grouping Test',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
        })
        .returning();

      const insertedModules = await db
        .insert(modules)
        .values([
          {
            planId: plan.id,
            order: 1,
            title: 'Module A',
            description: 'Module A',
            estimatedMinutes: 60,
          },
          {
            planId: plan.id,
            order: 2,
            title: 'Module B',
            description: 'Module B',
            estimatedMinutes: 90,
          },
        ])
        .returning();

      await db.insert(tasks).values([
        {
          moduleId: insertedModules[0].id,
          order: 1,
          title: 'Task A1',
          description: 'Task A1',
          estimatedMinutes: 20,
        },
        {
          moduleId: insertedModules[1].id,
          order: 1,
          title: 'Task B1',
          description: 'Task B1',
          estimatedMinutes: 30,
        },
        {
          moduleId: insertedModules[0].id,
          order: 2,
          title: 'Task A2',
          description: 'Task A2',
          estimatedMinutes: 40,
        },
      ]);

      const result = await getModulesWithTasksByPlanIds(userId, [plan.id]);

      expect(result).toHaveLength(2);

      const moduleA = result.find((m) => m.title === 'Module A');
      const moduleB = result.find((m) => m.title === 'Module B');

      expect(moduleA?.tasks).toHaveLength(2);
      expect(moduleB?.tasks).toHaveLength(1);

      expect(moduleA?.tasks.map((t) => t.title)).toEqual([
        'Task A1',
        'Task A2',
      ]);
      expect(moduleB?.tasks.map((t) => t.title)).toEqual(['Task B1']);
    });

    it('does not return modules for plans owned by another user', async () => {
      setTestUser('batch_requesting_user');
      const requestingUserId = await ensureUser({
        clerkUserId: 'batch_requesting_user',
        email: 'batch_requesting@example.com',
      });

      setTestUser('batch_other_owner');
      const otherUserId = await ensureUser({
        clerkUserId: 'batch_other_owner',
        email: 'batch_other_owner@example.com',
      });

      const [otherPlan] = await db
        .insert(learningPlans)
        .values({
          userId: otherUserId,
          topic: 'Private Plan',
          skillLevel: 'beginner',
          weeklyHours: 4,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
        })
        .returning();

      await db.insert(modules).values({
        planId: otherPlan.id,
        order: 1,
        title: 'Hidden Module',
        description: 'Should not be visible',
        estimatedMinutes: 30,
      });

      const result = await getModulesWithTasksByPlanIds(requestingUserId, [
        otherPlan.id,
      ]);

      expect(result).toEqual([]);
    });
  });

  describe('getProgressByPlanIds', () => {
    it('returns empty object when given no plan IDs', async () => {
      setTestUser('progress_empty_plan_user');
      const userId = await ensureUser({
        clerkUserId: 'progress_empty_plan_user',
        email: 'progress_empty_plan@example.com',
      });

      const result = await getProgressByPlanIds(userId, []);
      expect(result).toEqual({});
    });

    it('calculates correct progress for single plan', async () => {
      setTestUser('progress_single_user');
      const userId = await ensureUser({
        clerkUserId: 'progress_single_user',
        email: 'progress_single@example.com',
      });

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId,
          topic: 'Progress Test',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
        })
        .returning();

      const [module] = await db
        .insert(modules)
        .values({
          planId: plan.id,
          order: 1,
          title: 'Module 1',
          description: 'Test module',
          estimatedMinutes: 60,
        })
        .returning();

      const insertedTasks = await db
        .insert(tasks)
        .values([
          {
            moduleId: module.id,
            order: 1,
            title: 'Task 1',
            description: 'Task 1',
            estimatedMinutes: 20,
          },
          {
            moduleId: module.id,
            order: 2,
            title: 'Task 2',
            description: 'Task 2',
            estimatedMinutes: 20,
          },
          {
            moduleId: module.id,
            order: 3,
            title: 'Task 3',
            description: 'Task 3',
            estimatedMinutes: 20,
          },
        ])
        .returning();

      await db.insert(taskProgress).values([
        {
          userId,
          taskId: insertedTasks[0].id,
          status: 'completed',
        },
        {
          userId,
          taskId: insertedTasks[1].id,
          status: 'completed',
        },
      ]);

      const result = await getProgressByPlanIds(userId, [plan.id]);

      expect(result).toHaveProperty(plan.id);
      expect(result[plan.id]).toEqual({ completed: 2, total: 3 });
    });

    it('calculates correct progress for multiple plans', async () => {
      setTestUser('progress_multi_user');
      const userId = await ensureUser({
        clerkUserId: 'progress_multi_user',
        email: 'progress_multi@example.com',
      });

      const plans = await db
        .insert(learningPlans)
        .values([
          {
            userId,
            topic: 'Plan A',
            skillLevel: 'beginner',
            weeklyHours: 5,
            learningStyle: 'reading',
            visibility: 'private',
            origin: 'ai',
          },
          {
            userId,
            topic: 'Plan B',
            skillLevel: 'intermediate',
            weeklyHours: 10,
            learningStyle: 'video',
            visibility: 'private',
            origin: 'ai',
          },
        ])
        .returning();

      const insertedModules = await db
        .insert(modules)
        .values([
          {
            planId: plans[0].id,
            order: 1,
            title: 'Plan A Module',
            description: 'Module for plan A',
            estimatedMinutes: 60,
          },
          {
            planId: plans[1].id,
            order: 1,
            title: 'Plan B Module',
            description: 'Module for plan B',
            estimatedMinutes: 90,
          },
        ])
        .returning();

      const insertedTasks = await db
        .insert(tasks)
        .values([
          {
            moduleId: insertedModules[0].id,
            order: 1,
            title: 'Plan A Task 1',
            description: 'Task 1',
            estimatedMinutes: 30,
          },
          {
            moduleId: insertedModules[0].id,
            order: 2,
            title: 'Plan A Task 2',
            description: 'Task 2',
            estimatedMinutes: 30,
          },
          {
            moduleId: insertedModules[1].id,
            order: 1,
            title: 'Plan B Task 1',
            description: 'Task 1',
            estimatedMinutes: 45,
          },
          {
            moduleId: insertedModules[1].id,
            order: 2,
            title: 'Plan B Task 2',
            description: 'Task 2',
            estimatedMinutes: 45,
          },
        ])
        .returning();

      await db.insert(taskProgress).values([
        {
          userId,
          taskId: insertedTasks[0].id,
          status: 'completed',
        },
        {
          userId,
          taskId: insertedTasks[2].id,
          status: 'completed',
        },
        {
          userId,
          taskId: insertedTasks[3].id,
          status: 'completed',
        },
      ]);

      const planIds = plans.map((p) => p.id);
      const result = await getProgressByPlanIds(userId, planIds);

      expect(result[plans[0].id]).toEqual({ completed: 1, total: 2 });
      expect(result[plans[1].id]).toEqual({ completed: 2, total: 2 });
    });

    it('counts only completed tasks in progress', async () => {
      setTestUser('progress_status_user');
      const userId = await ensureUser({
        clerkUserId: 'progress_status_user',
        email: 'progress_status@example.com',
      });

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId,
          topic: 'Status Test',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
        })
        .returning();

      const [module] = await db
        .insert(modules)
        .values({
          planId: plan.id,
          order: 1,
          title: 'Module 1',
          description: 'Test module',
          estimatedMinutes: 60,
        })
        .returning();

      const insertedTasks = await db
        .insert(tasks)
        .values([
          {
            moduleId: module.id,
            order: 1,
            title: 'Task 1',
            description: 'Task 1',
            estimatedMinutes: 20,
          },
          {
            moduleId: module.id,
            order: 2,
            title: 'Task 2',
            description: 'Task 2',
            estimatedMinutes: 20,
          },
          {
            moduleId: module.id,
            order: 3,
            title: 'Task 3',
            description: 'Task 3',
            estimatedMinutes: 20,
          },
        ])
        .returning();

      await db.insert(taskProgress).values([
        {
          userId,
          taskId: insertedTasks[0].id,
          status: 'completed',
        },
        {
          userId,
          taskId: insertedTasks[1].id,
          status: 'in_progress',
        },
        {
          userId,
          taskId: insertedTasks[2].id,
          status: 'not_started',
        },
      ]);

      const result = await getProgressByPlanIds(userId, [plan.id]);

      expect(result[plan.id]).toEqual({ completed: 1, total: 3 });
    });

    it('returns zero progress for plans with no task progress', async () => {
      setTestUser('progress_no_progress_user');
      const userId = await ensureUser({
        clerkUserId: 'progress_no_progress_user',
        email: 'progress_no_progress@example.com',
      });

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId,
          topic: 'No Progress Test',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
        })
        .returning();

      const [module] = await db
        .insert(modules)
        .values({
          planId: plan.id,
          order: 1,
          title: 'Module 1',
          description: 'Test module',
          estimatedMinutes: 60,
        })
        .returning();

      await db.insert(tasks).values([
        {
          moduleId: module.id,
          order: 1,
          title: 'Task 1',
          description: 'Task 1',
          estimatedMinutes: 30,
        },
      ]);

      const result = await getProgressByPlanIds(userId, [plan.id]);

      expect(result[plan.id]).toEqual({ completed: 0, total: 1 });
    });

    it('returns zero totals for plans with no tasks', async () => {
      setTestUser('progress_no_tasks_user');
      const userId = await ensureUser({
        clerkUserId: 'progress_no_tasks_user',
        email: 'progress_no_tasks@example.com',
      });

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId,
          topic: 'No Tasks Test',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
        })
        .returning();

      await db.insert(modules).values({
        planId: plan.id,
        order: 1,
        title: 'Empty Module',
        description: 'Module with no tasks',
        estimatedMinutes: 60,
      });

      const result = await getProgressByPlanIds(userId, [plan.id]);

      expect(result[plan.id]).toEqual({ completed: 0, total: 0 });
    });

    it('does not include progress for plans owned by another user', async () => {
      setTestUser('progress_requesting_user');
      const requestingUserId = await ensureUser({
        clerkUserId: 'progress_requesting_user',
        email: 'progress_requesting@example.com',
      });

      setTestUser('progress_other_owner');
      const otherUserId = await ensureUser({
        clerkUserId: 'progress_other_owner',
        email: 'progress_other_owner@example.com',
      });

      const [otherPlan] = await db
        .insert(learningPlans)
        .values({
          userId: otherUserId,
          topic: 'Hidden Progress Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
        })
        .returning();

      const [module] = await db
        .insert(modules)
        .values({
          planId: otherPlan.id,
          order: 1,
          title: 'Hidden Module',
          description: 'Should not be visible',
          estimatedMinutes: 30,
        })
        .returning();

      const [task] = await db
        .insert(tasks)
        .values({
          moduleId: module.id,
          order: 1,
          title: 'Hidden Task',
          description: 'Should not be visible',
          estimatedMinutes: 15,
        })
        .returning();

      await db.insert(taskProgress).values({
        userId: otherUserId,
        taskId: task.id,
        status: 'completed',
      });

      const result = await getProgressByPlanIds(requestingUserId, [otherPlan.id]);

      expect(result).toEqual({});
    });

    it('isolates progress calculation per user', async () => {
      setTestUser('progress_isolation_user1');
      const user1Id = await ensureUser({
        clerkUserId: 'progress_isolation_user1',
        email: 'progress_isolation1@example.com',
      });

      const user2Id = await ensureUser({
        clerkUserId: 'progress_isolation_user2',
        email: 'progress_isolation2@example.com',
      });

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId: user1Id,
          topic: 'Shared Plan',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'reading',
          visibility: 'private',
          origin: 'ai',
        })
        .returning();

      const [module] = await db
        .insert(modules)
        .values({
          planId: plan.id,
          order: 1,
          title: 'Module 1',
          description: 'Test module',
          estimatedMinutes: 60,
        })
        .returning();

      const insertedTasks = await db
        .insert(tasks)
        .values([
          {
            moduleId: module.id,
            order: 1,
            title: 'Task 1',
            description: 'Task 1',
            estimatedMinutes: 30,
          },
          {
            moduleId: module.id,
            order: 2,
            title: 'Task 2',
            description: 'Task 2',
            estimatedMinutes: 30,
          },
        ])
        .returning();

      await db.insert(taskProgress).values([
        {
          userId: user1Id,
          taskId: insertedTasks[0].id,
          status: 'completed',
        },
        {
          userId: user2Id,
          taskId: insertedTasks[0].id,
          status: 'completed',
        },
        {
          userId: user2Id,
          taskId: insertedTasks[1].id,
          status: 'completed',
        },
      ]);

      const result1 = await getProgressByPlanIds(user1Id, [plan.id]);
      const result2 = await getProgressByPlanIds(user2Id, [plan.id]);

      expect(result1[plan.id]).toEqual({ completed: 1, total: 2 });
      expect(result2[plan.id]).toEqual({ completed: 2, total: 2 });
    });
  });
});
