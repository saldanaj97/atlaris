import { modules, tasks } from '@supabase/schema';
import {
  MAX_MODULE_LESSON_GENERATION_ERROR_LENGTH,
  MAX_TASK_LESSON_CONTENT_JSON_CHARS,
} from '@supabase/schema/constants';
import { db } from '@supabase/service-role';
import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

function hasCheckViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let i = 0; i < 8 && current; i++) {
    if (
      current !== null &&
      typeof current === 'object' &&
      'code' in current &&
      (current as { code?: unknown }).code === '23514'
    ) {
      return true;
    }
    if (current instanceof Error) {
      current = current.cause;
      continue;
    }
    break;
  }
  return false;
}

describe('lesson content persistence (integration)', () => {
  it('defaults module.lesson_generation_status to not_generated', async () => {
    const authUserId = buildTestAuthUserId('db-lesson-mod-default');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const plan = await createTestPlan({ userId, topic: 'lesson schema' });
    const mod = await createTestModule({ planId: plan.id });

    const rows = await db
      .select({
        lessonGenerationStatus: modules.lessonGenerationStatus,
      })
      .from(modules)
      .where(eq(modules.id, mod.id));

    expect(rows[0]?.lessonGenerationStatus).toBe('not_generated');
  });

  it('persists tasks.lesson_content JSON and rejects oversized payloads', async () => {
    const authUserId = buildTestAuthUserId('db-lesson-content-json');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const plan = await createTestPlan({ userId, topic: 'lesson json' });
    const mod = await createTestModule({ planId: plan.id });
    const task = await createTestTask({ moduleId: mod.id });

    const validContent = {
      version: 1 as const,
      blocks: [{ type: 'heading' as const, text: 'Hello' }],
    };

    await db
      .update(tasks)
      .set({
        lessonContent: validContent,
        lessonContentUpdatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id));

    const [loaded] = await db
      .select({ lessonContent: tasks.lessonContent })
      .from(tasks)
      .where(eq(tasks.id, task.id));

    expect(loaded?.lessonContent).toEqual(validContent);

    const padding = 'y'.repeat(MAX_TASK_LESSON_CONTENT_JSON_CHARS + 1);
    const hugeContent = {
      version: 1 as const,
      blocks: [{ type: 'paragraph' as const, text: padding }],
    };

    await expect(
      db
        .update(tasks)
        .set({ lessonContent: hugeContent })
        .where(eq(tasks.id, task.id)),
    ).rejects.toSatisfy(hasCheckViolation);
  });

  it('rejects modules.lesson_generation_error over CHECK cap', async () => {
    const authUserId = buildTestAuthUserId('db-lesson-gen-err');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });
    const plan = await createTestPlan({ userId, topic: 'lesson err cap' });
    const mod = await createTestModule({ planId: plan.id });

    const tooLong = 'e'.repeat(MAX_MODULE_LESSON_GENERATION_ERROR_LENGTH + 1);

    await expect(
      db
        .update(modules)
        .set({ lessonGenerationError: tooLong })
        .where(eq(modules.id, mod.id)),
    ).rejects.toSatisfy(hasCheckViolation);
  });
});
