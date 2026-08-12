import {
  claimModuleLessonGenerationOrDescribe,
  revertModuleLessonGeneratingToNotGenerated,
} from '@/lib/db/queries/module-lesson-generation';
import { modules } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestModule } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

describe('module lesson workflow metadata (integration)', () => {
  it('persists workflow run metadata on a generating module row', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-workflow-meta');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({ userId, topic: 'Workflow metadata' });
    const mod = await createTestModule({ planId: plan.id });

    const runId = `wrun_${authUserId}`;
    const startedAt = new Date().toISOString();
    const claim = await claimModuleLessonGenerationOrDescribe(
      db,
      plan.id,
      mod.id,
      userId,
      {
        workflow: {
          runId,
          startedAt,
        },
      },
    );
    expect(claim.kind).toBe('claimed');
    expect(claim).toMatchObject({ workflowStartedAt: startedAt });

    const [row] = await db
      .select({
        status: modules.lessonGenerationStatus,
        startedAt: modules.lessonGenerationStartedAt,
        metadata: modules.lessonGenerationMetadata,
      })
      .from(modules)
      .where(eq(modules.id, mod.id));

    expect(row).toMatchObject({
      status: 'generating',
      startedAt: new Date(startedAt),
      metadata: {
        version: 1,
        workflow: {
          provider: 'workflow-sdk',
          runId,
        },
      },
    });

    const replayStartedAt = new Date(Date.now() + 1_000).toISOString();
    const replay = await claimModuleLessonGenerationOrDescribe(
      db,
      plan.id,
      mod.id,
      userId,
      {
        workflow: {
          runId,
          startedAt: replayStartedAt,
        },
      },
    );
    expect(replay.kind).toBe('claimed');
    expect(replay).toMatchObject({ workflowStartedAt: startedAt });

    const competing = await claimModuleLessonGenerationOrDescribe(
      db,
      plan.id,
      mod.id,
      userId,
      {
        workflow: {
          runId: `${runId}_other`,
          startedAt: new Date().toISOString(),
        },
      },
    );
    expect(competing.kind).toBe('in_flight');

    const [unchanged] = await db
      .select({ metadata: modules.lessonGenerationMetadata })
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(unchanged?.metadata?.workflow?.runId).toBe(runId);
  });

  it('does not release a newer workflow claim from a stale cleanup', async () => {
    const authUserId = buildTestAuthUserId('mod-lesson-stale-cleanup');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({ userId, topic: 'Stale cleanup' });
    const mod = await createTestModule({ planId: plan.id });
    const runA = `wrun_${authUserId}_a`;
    const runB = `wrun_${authUserId}_b`;

    const claimA = await claimModuleLessonGenerationOrDescribe(
      db,
      plan.id,
      mod.id,
      userId,
      { workflow: { runId: runA, startedAt: new Date().toISOString() } },
    );
    expect(claimA.kind).toBe('claimed');

    await revertModuleLessonGeneratingToNotGenerated(db, {
      userId,
      planId: plan.id,
      moduleId: mod.id,
      workflowRunId: runA,
    });

    const [reverted] = await db
      .select({
        status: modules.lessonGenerationStatus,
        metadata: modules.lessonGenerationMetadata,
      })
      .from(modules)
      .where(eq(modules.id, mod.id));
    expect(reverted).toMatchObject({
      status: 'not_generated',
      metadata: { workflow: { runId: runA } },
    });

    const claimB = await claimModuleLessonGenerationOrDescribe(
      db,
      plan.id,
      mod.id,
      userId,
      { workflow: { runId: runB, startedAt: new Date().toISOString() } },
    );
    expect(claimB.kind).toBe('claimed');

    await revertModuleLessonGeneratingToNotGenerated(db, {
      userId,
      planId: plan.id,
      moduleId: mod.id,
      workflowRunId: runA,
    });

    const [row] = await db
      .select({
        status: modules.lessonGenerationStatus,
        metadata: modules.lessonGenerationMetadata,
      })
      .from(modules)
      .where(eq(modules.id, mod.id));

    expect(row).toMatchObject({
      status: 'generating',
      metadata: { workflow: { runId: runB } },
    });
  });
});
