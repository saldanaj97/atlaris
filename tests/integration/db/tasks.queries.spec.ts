/**
 * Integration tests for DB tasks queries
 * Tests: appendTaskDescription sanitization, appendTaskMicroExplanation flag behavior
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/service-role';
import { tasks, modules, learningPlans, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  appendTaskDescription,
  appendTaskMicroExplanation,
} from '@/lib/db/queries/tasks';

describe('DB Tasks Queries', () => {
  let testUserId: string;
  let testPlanId: string;
  let testModuleId: string;
  let testTaskId: string;

  beforeEach(async () => {
    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        clerkUserId: 'test-clerk-id-tasks',
        email: 'test-tasks@example.com',
        subscriptionTier: 'free',
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
        weeklyHours: 5,
        learningStyle: 'mixed',
        generationStatus: 'ready',
      })
      .returning();
    testPlanId = plan.id;

    // Create test module
    const [module] = await db
      .insert(modules)
      .values({
        planId: testPlanId,
        order: 1,
        title: 'Test Module',
        estimatedMinutes: 60,
      })
      .returning();
    testModuleId = module.id;

    // Create test task
    const [task] = await db
      .insert(tasks)
      .values({
        moduleId: testModuleId,
        order: 1,
        title: 'Test Task',
        description: 'Initial description',
        estimatedMinutes: 30,
        hasMicroExplanation: false,
      })
      .returning();
    testTaskId = task.id;
  });

  describe('appendTaskDescription', () => {
    it('should sanitize HTML tags from additional description', async () => {
      const maliciousInput = '<script>alert("XSS")</script>Hello <b>world</b>';
      await appendTaskDescription(testTaskId, maliciousInput);

      const [updatedTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, testTaskId))
        .limit(1);

      expect(updatedTask?.description).toContain('Hello world');
      expect(updatedTask?.description).not.toContain('<script>');
      expect(updatedTask?.description).not.toContain('<b>');
    });

    it('should sanitize HTML comments from additional description', async () => {
      const inputWithComment = 'Text <!-- comment --> more text';
      await appendTaskDescription(testTaskId, inputWithComment);

      const [updatedTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, testTaskId))
        .limit(1);

      expect(updatedTask?.description).toContain('Text');
      expect(updatedTask?.description).toContain('more text');
      expect(updatedTask?.description).not.toContain('<!--');
      expect(updatedTask?.description).not.toContain('-->');
    });

    it('should sanitize existing description when appending', async () => {
      // First, add some HTML to the task
      await db
        .update(tasks)
        .set({ description: 'Existing <script>bad</script> text' })
        .where(eq(tasks.id, testTaskId));

      await appendTaskDescription(testTaskId, 'New text');

      const [updatedTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, testTaskId))
        .limit(1);

      expect(updatedTask?.description).toContain('Existing');
      expect(updatedTask?.description).toContain('text');
      expect(updatedTask?.description).toContain('New text');
      expect(updatedTask?.description).not.toContain('<script>');
    });

    it('should decode HTML entities', async () => {
      const inputWithEntities = 'Hello &amp; world &lt;test&gt;';
      await appendTaskDescription(testTaskId, inputWithEntities);

      const [updatedTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, testTaskId))
        .limit(1);

      expect(updatedTask?.description).toContain('Hello & world');
      expect(updatedTask?.description).toContain('<test>');
    });

    it('should preserve legitimate content while removing dangerous elements', async () => {
      const input =
        'Learn React hooks.\n\nUse useState to manage state.\n\n<!-- micro-explanation-abc123 -->\nPractice: Build a counter app.';
      await appendTaskDescription(testTaskId, input);

      const [updatedTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, testTaskId))
        .limit(1);

      expect(updatedTask?.description).toContain('Learn React hooks');
      expect(updatedTask?.description).toContain('Use useState');
      expect(updatedTask?.description).toContain(
        'Practice: Build a counter app'
      );
      expect(updatedTask?.description).not.toContain('<!--');
      expect(updatedTask?.description).not.toContain('-->');
    });

    it('should handle empty additional description', async () => {
      const originalDescription = 'Original description';
      await db
        .update(tasks)
        .set({ description: originalDescription })
        .where(eq(tasks.id, testTaskId));

      await appendTaskDescription(testTaskId, '');

      const [updatedTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, testTaskId))
        .limit(1);

      expect(updatedTask?.description).toBe(originalDescription);
    });
  });

  describe('appendTaskMicroExplanation', () => {
    it('should append micro-explanation and set flag', async () => {
      const explanation = 'This is a micro-explanation about useState.';
      await appendTaskMicroExplanation(testTaskId, explanation);

      const [updatedTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, testTaskId))
        .limit(1);

      expect(updatedTask?.hasMicroExplanation).toBe(true);
      expect(updatedTask?.description).toContain('Micro-explanation');
      expect(updatedTask?.description).toContain(explanation);
    });

    it('should not append duplicate micro-explanation if flag is already set', async () => {
      // Set flag first
      await db
        .update(tasks)
        .set({ hasMicroExplanation: true })
        .where(eq(tasks.id, testTaskId));

      const originalDescription = 'Original description';
      await db
        .update(tasks)
        .set({ description: originalDescription })
        .where(eq(tasks.id, testTaskId));

      const explanation = 'This should not be added';
      await appendTaskMicroExplanation(testTaskId, explanation);

      const [updatedTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, testTaskId))
        .limit(1);

      expect(updatedTask?.description).toBe(originalDescription);
      expect(updatedTask?.description).not.toContain(explanation);
      expect(updatedTask?.hasMicroExplanation).toBe(true);
    });

    it('should sanitize micro-explanation content', async () => {
      const maliciousExplanation =
        '<script>alert("XSS")</script>Explanation with <b>formatting</b>';
      await appendTaskMicroExplanation(testTaskId, maliciousExplanation);

      const [updatedTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, testTaskId))
        .limit(1);

      expect(updatedTask?.description).toContain('Explanation with formatting');
      expect(updatedTask?.description).not.toContain('<script>');
      expect(updatedTask?.description).not.toContain('<b>');
      expect(updatedTask?.hasMicroExplanation).toBe(true);
    });

    it('should sanitize existing description when appending micro-explanation', async () => {
      // Add HTML to existing description
      await db
        .update(tasks)
        .set({ description: 'Task <script>bad</script> description' })
        .where(eq(tasks.id, testTaskId));

      await appendTaskMicroExplanation(testTaskId, 'Clean explanation');

      const [updatedTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, testTaskId))
        .limit(1);

      expect(updatedTask?.description).toContain('Task');
      expect(updatedTask?.description).toContain('description');
      expect(updatedTask?.description).toContain('Clean explanation');
      expect(updatedTask?.description).not.toContain('<script>');
      expect(updatedTask?.hasMicroExplanation).toBe(true);
    });

    it('should handle task without existing description', async () => {
      await db
        .update(tasks)
        .set({ description: null })
        .where(eq(tasks.id, testTaskId));

      const explanation = 'Micro-explanation for empty task';
      await appendTaskMicroExplanation(testTaskId, explanation);

      const [updatedTask] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, testTaskId))
        .limit(1);

      expect(updatedTask?.description).toContain('Micro-explanation');
      expect(updatedTask?.description).toContain(explanation);
      expect(updatedTask?.hasMicroExplanation).toBe(true);
    });

    it('should throw error if task does not exist', async () => {
      const nonExistentTaskId = '00000000-0000-0000-0000-000000000000';
      await expect(
        appendTaskMicroExplanation(nonExistentTaskId, 'Explanation')
      ).rejects.toThrow('Task not found');
    });
  });
});
