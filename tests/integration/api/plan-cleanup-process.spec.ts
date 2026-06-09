import { POST as POST_PLAN_CLEANUP } from '@/app/api/internal/maintenance/plans/cleanup/route';
import {
  ORPHANED_ATTEMPT_THRESHOLD_MS,
  STUCK_PLAN_THRESHOLD_MS,
} from '@/features/plans/cleanup';
import { generationAttempts, learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestPlan } from '@tests/fixtures/plans';
import { createTestUser } from '@tests/fixtures/users';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

const ORIGINAL_ENV = {
  MAINTENANCE_WORKER_TOKEN: process.env.MAINTENANCE_WORKER_TOKEN,
  PLAN_CLEANUP_ENABLED: process.env.PLAN_CLEANUP_ENABLED,
};

function restoreEnvVar(name: keyof typeof ORIGINAL_ENV): void {
  const originalValue = ORIGINAL_ENV[name];
  if (originalValue === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = originalValue;
}

describe('POST /api/internal/maintenance/plans/cleanup', () => {
  afterEach(() => {
    const envKeys: Array<keyof typeof ORIGINAL_ENV> = [
      'MAINTENANCE_WORKER_TOKEN',
      'PLAN_CLEANUP_ENABLED',
    ];
    envKeys.forEach(restoreEnvVar);
  });

  it('returns 503 when plan cleanup is disabled', async () => {
    process.env.PLAN_CLEANUP_ENABLED = 'false';

    const response = await POST_PLAN_CLEANUP(
      new Request('http://localhost/api/internal/maintenance/plans/cleanup', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(503);
  });

  it('rejects unauthorized requests when a worker token is configured', async () => {
    process.env.MAINTENANCE_WORKER_TOKEN = 'maintenance-secret';
    process.env.PLAN_CLEANUP_ENABLED = 'true';

    const response = await POST_PLAN_CLEANUP(
      new Request('http://localhost/api/internal/maintenance/plans/cleanup', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(401);
  });

  it('runs plan cleanup and returns cleaned counts', async () => {
    process.env.PLAN_CLEANUP_ENABLED = 'true';
    delete process.env.MAINTENANCE_WORKER_TOKEN;

    const user = await createTestUser();
    const stuckCutoff = new Date(Date.now() - STUCK_PLAN_THRESHOLD_MS - 60_000);
    const staleAttemptCutoff = new Date(
      Date.now() - ORPHANED_ATTEMPT_THRESHOLD_MS - 60_000,
    );

    const stuckPlan = await createTestPlan({
      userId: user.id,
      topic: 'Route stuck plan',
      generationStatus: 'generating',
    });
    const attemptPlan = await createTestPlan({
      userId: user.id,
      topic: 'Route orphaned attempt plan',
    });

    await db
      .update(learningPlans)
      .set({ updatedAt: stuckCutoff })
      .where(eq(learningPlans.id, stuckPlan.id));

    const [orphanedAttempt] = await db
      .insert(generationAttempts)
      .values({
        planId: attemptPlan.id,
        status: 'in_progress',
        classification: null,
        durationMs: 0,
        modulesCount: 0,
        tasksCount: 0,
      })
      .returning();

    await db
      .update(generationAttempts)
      .set({ createdAt: staleAttemptCutoff })
      .where(eq(generationAttempts.id, orphanedAttempt.id));

    const response = await POST_PLAN_CLEANUP(
      new Request('http://localhost/api/internal/maintenance/plans/cleanup', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      stuckPlansCleaned: number;
      orphanedAttemptsCleaned: number;
    };
    expect(body.ok).toBe(true);
    expect(body.stuckPlansCleaned).toBeGreaterThanOrEqual(1);
    expect(body.orphanedAttemptsCleaned).toBeGreaterThanOrEqual(1);

    const [stuckRow] = await db
      .select({ generationStatus: learningPlans.generationStatus })
      .from(learningPlans)
      .where(eq(learningPlans.id, stuckPlan.id));
    expect(stuckRow?.generationStatus).toBe('failed');

    const [attemptRow] = await db
      .select({
        status: generationAttempts.status,
        classification: generationAttempts.classification,
      })
      .from(generationAttempts)
      .where(eq(generationAttempts.id, orphanedAttempt.id));
    expect(attemptRow).toMatchObject({
      status: 'failure',
      classification: 'timeout',
    });
  });
});
