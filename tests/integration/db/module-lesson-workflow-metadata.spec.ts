import {
  claimModuleLessonGenerationOrDescribe,
  persistModuleLessonWorkflowRunMetadata,
} from '@/lib/db/queries/module-lesson-generation';
import { modules } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestModule } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('module lesson workflow metadata (integration)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('LESSON_GENERATION_ENABLED', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('persists workflow run metadata on a generating module row', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-workflow-meta');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({ userId, topic: 'Workflow metadata' });
    const mod = await createTestModule({ planId: plan.id });

    const claim = await claimModuleLessonGenerationOrDescribe(
      db,
      plan.id,
      mod.id,
      userId,
    );
    expect(claim.kind).toBe('claimed');

    const runId = 'wrun_test_metadata';
    await persistModuleLessonWorkflowRunMetadata(db, {
      userId,
      planId: plan.id,
      moduleId: mod.id,
      runId,
      startedAt: new Date().toISOString(),
    });

    const [row] = await db
      .select({ metadata: modules.lessonGenerationMetadata })
      .from(modules)
      .where(eq(modules.id, mod.id));

    expect(row?.metadata).toMatchObject({
      version: 1,
      workflow: {
        provider: 'workflow-sdk',
        runId,
      },
    });
  });
});
