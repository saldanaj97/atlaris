import {
  insertGenerationQualityIssues,
  listGenerationQualityIssuesForPlan,
  markGenerationQualityIssuesResolved,
} from '@/lib/db/queries/generation-quality-issues';
import { generationQualityIssues, tasks } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { truncateAll } from '@tests/helpers/db/truncate';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

async function createLessonFixture(suffix: string) {
  const authUserId = buildTestAuthUserId(`quality-${suffix}`);
  const userId = await ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
  });
  const plan = await createTestPlan({ userId, topic: 'Quality Plan' });
  const module = await createTestModule({ planId: plan.id });
  const task = await createTestTask({ moduleId: module.id });
  return { plan, module, task };
}

describe('generation quality issue queries', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('records outline and lesson issues, lists them, and marks them resolved', async () => {
    const { plan, module, task } = await createLessonFixture('insert-read');

    const inserted = await insertGenerationQualityIssues(
      [
        {
          planId: plan.id,
          stage: 'outline',
          issueCode: 'module_count_low',
          message: 'Outline has fewer modules than the plan length needs.',
          pass: 0,
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
        },
        {
          planId: plan.id,
          moduleId: module.id,
          taskId: task.id,
          stage: 'lesson',
          blockRef: 'blocks[2]',
          issueCode: 'citation_missing',
          message: 'Claim has no citation.',
          pass: 2,
          createdAt: new Date('2026-10-01T00:00:01.000Z'),
        },
      ],
      db,
    );
    expect(inserted).toHaveLength(2);

    const listed = await listGenerationQualityIssuesForPlan(plan.id, db);
    expect(listed.map((issue) => issue.issueCode)).toEqual([
      'module_count_low',
      'citation_missing',
    ]);
    expect(listed[0]).toMatchObject({
      moduleId: null,
      taskId: null,
      blockRef: null,
      stage: 'outline',
      pass: 0,
      resolved: false,
    });
    expect(listed[1]).toMatchObject({
      moduleId: module.id,
      taskId: task.id,
      stage: 'lesson',
      blockRef: 'blocks[2]',
      pass: 2,
      resolved: false,
    });

    const lessonIssueId = listed[1]?.id;
    if (!lessonIssueId) throw new Error('Expected lesson issue id');
    await expect(
      markGenerationQualityIssuesResolved([lessonIssueId], db),
    ).resolves.toBe(1);

    const afterResolve = await listGenerationQualityIssuesForPlan(plan.id, db);
    expect(afterResolve.map((issue) => issue.resolved)).toEqual([false, true]);
  });

  it('skips empty batches without querying', async () => {
    await expect(insertGenerationQualityIssues([], db)).resolves.toEqual([]);
    await expect(markGenerationQualityIssuesResolved([], db)).resolves.toBe(0);
  });

  it('rejects pass numbers outside 0 to 2', async () => {
    const { plan } = await createLessonFixture('pass-range');

    for (const pass of [-1, 3]) {
      await expect(
        db.insert(generationQualityIssues).values({
          planId: plan.id,
          stage: 'outline',
          issueCode: 'bad_pass',
          message: 'Out of range pass.',
          pass,
        }),
      ).rejects.toMatchObject({
        cause: { constraint_name: 'generation_quality_issues_pass_range' },
      });
    }
  });

  it('deletes lesson issues with their lesson', async () => {
    const { plan, module, task } = await createLessonFixture('cascade');
    await insertGenerationQualityIssues(
      [
        {
          planId: plan.id,
          moduleId: module.id,
          taskId: task.id,
          stage: 'lesson',
          issueCode: 'citation_missing',
          message: 'Claim has no citation.',
          pass: 1,
        },
      ],
      db,
    );

    await db.delete(tasks).where(eq(tasks.id, task.id));

    await expect(
      listGenerationQualityIssuesForPlan(plan.id, db),
    ).resolves.toEqual([]);
  });
});
