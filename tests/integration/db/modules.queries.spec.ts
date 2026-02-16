import { beforeEach, describe, expect, it } from 'vitest';

import { getModuleDetail } from '@/lib/db/queries/modules';
import { createTestModule, createTestTask } from '../../fixtures/modules';
import { createTestPlan } from '../../fixtures/plans';
import { ensureUser } from '../../helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

describe('Module Queries', () => {
  let userId: string;
  let planId: string;

  beforeEach(async () => {
    const authUserId = buildTestAuthUserId('db-modules-queries');
    userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });

    const plan = await createTestPlan({ userId });
    planId = plan.id;
  });

  describe('getModuleDetail', () => {
    it('should retrieve module with its tasks', async () => {
      const module = await createTestModule({
        planId,
        title: 'Test Module',
        description: 'Test module description',
        estimatedMinutes: 120,
      });

      await createTestTask({
        moduleId: module.id,
        order: 1,
        title: 'Task 1',
        description: 'First task',
        estimatedMinutes: 30,
      });
      await createTestTask({
        moduleId: module.id,
        order: 2,
        title: 'Task 2',
        description: 'Second task',
        estimatedMinutes: 45,
      });

      const result = await getModuleDetail(module.id);

      expect(result).not.toBeNull();
      expect(result?.module.id).toBe(module.id);
      expect(result?.module.title).toBe('Test Module');
      expect(result?.module.tasks).toHaveLength(2);

      const taskTitles = result?.module.tasks.map((t) => t.title) ?? [];
      expect(taskTitles).toContain('Task 1');
      expect(taskTitles).toContain('Task 2');
    });

    it('should return null for non-existent module', async () => {
      const result = await getModuleDetail(
        '00000000-0000-0000-0000-000000000000'
      );

      expect(result).toBeNull();
    });

    it('should retrieve module with no tasks', async () => {
      const module = await createTestModule({
        planId,
        title: 'Empty Module',
        description: 'Module with no tasks',
        estimatedMinutes: 0,
      });

      const result = await getModuleDetail(module.id);

      expect(result).not.toBeNull();
      expect(result?.module.title).toBe('Empty Module');
      expect(result?.module.tasks).toHaveLength(0);
    });

    it('should preserve task order in results', async () => {
      const module = await createTestModule({
        planId,
        title: 'Ordered Tasks Module',
        description: 'Module with ordered tasks',
        estimatedMinutes: 180,
      });

      await createTestTask({
        moduleId: module.id,
        order: 1,
        title: 'First Task',
        description: 'Task 1',
        estimatedMinutes: 60,
      });
      await createTestTask({
        moduleId: module.id,
        order: 2,
        title: 'Second Task',
        description: 'Task 2',
        estimatedMinutes: 60,
      });
      await createTestTask({
        moduleId: module.id,
        order: 3,
        title: 'Third Task',
        description: 'Task 3',
        estimatedMinutes: 60,
      });

      const result = await getModuleDetail(module.id);

      expect(result).not.toBeNull();
      expect(result?.module.tasks).toHaveLength(3);

      const taskOrders = result?.module.tasks.map((t) => t.order) ?? [];
      expect(taskOrders).toContain(1);
      expect(taskOrders).toContain(2);
      expect(taskOrders).toContain(3);
    });

    it('should return all task details correctly', async () => {
      const module = await createTestModule({
        planId,
        title: 'Detailed Module',
        description: 'Module for testing task details',
        estimatedMinutes: 90,
      });

      const task = await createTestTask({
        moduleId: module.id,
        title: 'Detailed Task',
        description: 'This is a detailed task description',
        estimatedMinutes: 90,
      });

      const result = await getModuleDetail(module.id);

      expect(result).not.toBeNull();
      expect(result?.module.tasks).toHaveLength(1);
      const fetchedTask = result?.module.tasks[0];
      expect(fetchedTask).not.toBeUndefined();
      expect(fetchedTask?.id).toBe(task.id);
      expect(fetchedTask?.title).toBe('Detailed Task');
      expect(fetchedTask?.description).toBe(
        'This is a detailed task description'
      );
      expect(fetchedTask?.estimatedMinutes).toBe(90);
      expect(fetchedTask?.order).toBe(1);
    });

    it('should not return tasks from different modules', async () => {
      const module1 = await createTestModule({
        planId,
        order: 1,
        title: 'Module 1',
        description: 'First module',
        estimatedMinutes: 60,
      });

      const module2 = await createTestModule({
        planId,
        order: 2,
        title: 'Module 2',
        description: 'Second module',
        estimatedMinutes: 60,
      });

      await createTestTask({
        moduleId: module1.id,
        title: 'Module 1 Task',
        description: 'Task for module 1',
        estimatedMinutes: 30,
      });
      await createTestTask({
        moduleId: module2.id,
        title: 'Module 2 Task',
        description: 'Task for module 2',
        estimatedMinutes: 30,
      });

      const result = await getModuleDetail(module1.id);

      expect(result).not.toBeNull();
      expect(result?.module.tasks).toHaveLength(1);
      expect(result?.module.tasks[0].title).toBe('Module 1 Task');
    });

    it('should handle modules with many tasks', async () => {
      const module = await createTestModule({
        planId,
        title: 'Large Module',
        description: 'Module with many tasks',
        estimatedMinutes: 600,
      });

      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          createTestTask({
            moduleId: module.id,
            order: i + 1,
            title: `Task ${i + 1}`,
            description: `Description for task ${i + 1}`,
            estimatedMinutes: 60,
          })
        )
      );

      const result = await getModuleDetail(module.id);

      expect(result).not.toBeNull();
      expect(result?.module.id).toBe(module.id);
      expect(result?.module.title).toBe('Large Module');
      expect(result?.module.tasks).toHaveLength(10);

      const taskIds = result?.module.tasks.map((t) => t.id) ?? [];
      const uniqueTaskIds = new Set(taskIds);
      expect(uniqueTaskIds.size).toBe(10);
    });

    it('should include module metadata fields', async () => {
      const module = await createTestModule({
        planId,
        order: 5,
        title: 'Metadata Module',
        description: 'Testing metadata fields',
        estimatedMinutes: 240,
      });

      await createTestTask({
        moduleId: module.id,
        title: 'Test Task',
        description: 'Task description',
      });

      const result = await getModuleDetail(module.id);

      expect(result).not.toBeNull();
      expect(result?.module.order).toBe(5);
      expect(result?.module.estimatedMinutes).toBe(240);
      expect(result?.module.createdAt).toBeInstanceOf(Date);
      expect(result?.module.updatedAt).toBeInstanceOf(Date);
    });
  });
});
