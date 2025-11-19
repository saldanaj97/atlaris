import { describe, expect, it, beforeEach } from 'vitest';

import { db } from '@/lib/db/service-role';
import { getModuleWithTasks } from '@/lib/db/queries/modules';
import { learningPlans, modules, tasks } from '@/lib/db/schema';
import { ensureUser } from '../../helpers/db';

describe('Module Queries', () => {
  let userId: string;
  let planId: string;
  let moduleId: string;

  beforeEach(async () => {
    // Create a user and plan for testing
    userId = await ensureUser({
      clerkUserId: 'clerk_module_test_user',
      email: 'moduletest@example.com',
    });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Test Module Plan',
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

  describe('getModuleWithTasks', () => {
    it('should retrieve module with its tasks', async () => {
      // Create a module
      const [module] = await db
        .insert(modules)
        .values({
          planId,
          order: 1,
          title: 'Test Module',
          description: 'Test module description',
          estimatedMinutes: 120,
        })
        .returning();

      moduleId = module.id;

      // Create tasks for the module
      await db.insert(tasks).values([
        {
          moduleId,
          order: 1,
          title: 'Task 1',
          description: 'First task',
          estimatedMinutes: 30,
        },
        {
          moduleId,
          order: 2,
          title: 'Task 2',
          description: 'Second task',
          estimatedMinutes: 45,
        },
      ]);

      // Retrieve module with tasks
      const result = await getModuleWithTasks(moduleId);

      expect(result).toBeDefined();
      expect(result.length).toBe(2); // Should have 2 rows (one per task)

      // Check module data is present in all rows
      expect(result[0].modules).not.toBeNull();
      expect(result[0].modules?.id).toBe(moduleId);
      expect(result[0].modules?.title).toBe('Test Module');

      // Check tasks are present
      expect(result[0].tasks).not.toBeNull();
      expect(result[1].tasks).not.toBeNull();

      const taskTitles = result.map((r) => r.tasks?.title);
      expect(taskTitles).toContain('Task 1');
      expect(taskTitles).toContain('Task 2');
    });

    it('should return empty result for non-existent module', async () => {
      const result = await getModuleWithTasks(
        '00000000-0000-0000-0000-000000000000'
      );

      expect(result).toEqual([]);
    });

    it('should retrieve module with no tasks (left join)', async () => {
      // Create a module without tasks
      const [module] = await db
        .insert(modules)
        .values({
          planId,
          order: 1,
          title: 'Empty Module',
          description: 'Module with no tasks',
          estimatedMinutes: 0,
        })
        .returning();

      // Retrieve module
      const result = await getModuleWithTasks(module.id);

      expect(result).toBeDefined();
      expect(result.length).toBe(1); // Should have 1 row with null task
      expect(result[0].modules).not.toBeNull();
      expect(result[0].modules?.title).toBe('Empty Module');
      expect(result[0].tasks).toBeNull(); // Left join should give null for missing tasks
    });

    it('should preserve task order in results', async () => {
      // Create a module with ordered tasks
      const [module] = await db
        .insert(modules)
        .values({
          planId,
          order: 1,
          title: 'Ordered Tasks Module',
          description: 'Module with ordered tasks',
          estimatedMinutes: 180,
        })
        .returning();

      // Insert tasks in specific order
      await db.insert(tasks).values([
        {
          moduleId: module.id,
          order: 1,
          title: 'First Task',
          description: 'Task 1',
          estimatedMinutes: 60,
        },
        {
          moduleId: module.id,
          order: 2,
          title: 'Second Task',
          description: 'Task 2',
          estimatedMinutes: 60,
        },
        {
          moduleId: module.id,
          order: 3,
          title: 'Third Task',
          description: 'Task 3',
          estimatedMinutes: 60,
        },
      ]);

      const result = await getModuleWithTasks(module.id);

      expect(result.length).toBe(3);

      // Tasks should be retrievable with their order
      const taskOrders = result.map((r) => r.tasks?.order).filter(Boolean);
      expect(taskOrders).toContain(1);
      expect(taskOrders).toContain(2);
      expect(taskOrders).toContain(3);
    });

    it('should return all task details correctly', async () => {
      // Create a module
      const [module] = await db
        .insert(modules)
        .values({
          planId,
          order: 1,
          title: 'Detailed Module',
          description: 'Module for testing task details',
          estimatedMinutes: 90,
        })
        .returning();

      // Create a detailed task
      const [task] = await db
        .insert(tasks)
        .values({
          moduleId: module.id,
          order: 1,
          title: 'Detailed Task',
          description: 'This is a detailed task description',
          estimatedMinutes: 90,
        })
        .returning();

      const result = await getModuleWithTasks(module.id);

      expect(result.length).toBe(1);
      expect(result[0].tasks).not.toBeNull();
      expect(result[0].tasks?.id).toBe(task.id);
      expect(result[0].tasks?.title).toBe('Detailed Task');
      expect(result[0].tasks?.description).toBe(
        'This is a detailed task description'
      );
      expect(result[0].tasks?.estimatedMinutes).toBe(90);
      expect(result[0].tasks?.order).toBe(1);
    });

    it('should not return tasks from different modules', async () => {
      // Create two modules
      const [module1] = await db
        .insert(modules)
        .values({
          planId,
          order: 1,
          title: 'Module 1',
          description: 'First module',
          estimatedMinutes: 60,
        })
        .returning();

      const [module2] = await db
        .insert(modules)
        .values({
          planId,
          order: 2,
          title: 'Module 2',
          description: 'Second module',
          estimatedMinutes: 60,
        })
        .returning();

      // Create tasks for each module
      await db.insert(tasks).values([
        {
          moduleId: module1.id,
          order: 1,
          title: 'Module 1 Task',
          description: 'Task for module 1',
          estimatedMinutes: 30,
        },
        {
          moduleId: module2.id,
          order: 1,
          title: 'Module 2 Task',
          description: 'Task for module 2',
          estimatedMinutes: 30,
        },
      ]);

      // Retrieve module 1
      const result = await getModuleWithTasks(module1.id);

      expect(result.length).toBe(1);
      expect(result[0].tasks?.title).toBe('Module 1 Task');
      expect(result[0].tasks?.title).not.toBe('Module 2 Task');
    });

    it('should handle modules with many tasks', async () => {
      // Create a module
      const [module] = await db
        .insert(modules)
        .values({
          planId,
          order: 1,
          title: 'Large Module',
          description: 'Module with many tasks',
          estimatedMinutes: 600,
        })
        .returning();

      // Create 10 tasks
      const taskValues = Array.from({ length: 10 }, (_, i) => ({
        moduleId: module.id,
        order: i + 1,
        title: `Task ${i + 1}`,
        description: `Description for task ${i + 1}`,
        estimatedMinutes: 60,
      }));

      await db.insert(tasks).values(taskValues);

      const result = await getModuleWithTasks(module.id);

      expect(result.length).toBe(10);

      // All rows should have the same module
      result.forEach((row) => {
        expect(row.modules?.id).toBe(module.id);
        expect(row.modules?.title).toBe('Large Module');
      });

      // All tasks should be unique
      const taskIds = result.map((r) => r.tasks?.id).filter(Boolean);
      const uniqueTaskIds = new Set(taskIds);
      expect(uniqueTaskIds.size).toBe(10);
    });

    it('should include module metadata fields', async () => {
      // Create a module with all fields
      const [module] = await db
        .insert(modules)
        .values({
          planId,
          order: 5,
          title: 'Metadata Module',
          description: 'Testing metadata fields',
          estimatedMinutes: 240,
        })
        .returning();

      await db.insert(tasks).values({
        moduleId: module.id,
        order: 1,
        title: 'Test Task',
        description: 'Task description',
        estimatedMinutes: 30,
      });

      const result = await getModuleWithTasks(module.id);

      expect(result[0].modules).not.toBeNull();
      expect(result[0].modules?.order).toBe(5);
      expect(result[0].modules?.estimatedMinutes).toBe(240);
      expect(result[0].modules?.createdAt).toBeInstanceOf(Date);
      expect(result[0].modules?.updatedAt).toBeInstanceOf(Date);
    });
  });
});
