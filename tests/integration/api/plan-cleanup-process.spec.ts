import { POST as POST_PLAN_CLEANUP } from '@/app/api/internal/maintenance/plans/cleanup/route';
import * as planCleanup from '@/features/plans/cleanup';
import {
  ORPHANED_ATTEMPT_THRESHOLD_MS,
  STUCK_PLAN_THRESHOLD_MS,
} from '@/features/plans/cleanup';
import { generationAttempts, learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestPlan } from '@tests/fixtures/plans';
import { createTestUser } from '@tests/fixtures/users';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

const CLEANUP_URL = 'http://localhost/api/internal/maintenance/plans/cleanup';
const WORKER_TOKEN = 'maintenance-secret';

function createCleanupRequest(
  init: RequestInit & { token?: string; useBearer?: boolean } = {},
): Request {
  const { token, useBearer = true, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);

  if (token) {
    if (useBearer) {
      headers.set('Authorization', `Bearer ${token}`);
    } else {
      headers.set('x-maintenance-worker-token', token);
    }
  }

  return new Request(CLEANUP_URL, {
    method: 'POST',
    ...requestInit,
    headers,
  });
}

describe('POST /api/internal/maintenance/plans/cleanup', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 503 when plan cleanup is disabled', async () => {
    vi.stubEnv('PLAN_CLEANUP_ENABLED', 'false');

    const response = await POST_PLAN_CLEANUP(createCleanupRequest());

    expect(response.status).toBe(503);
  });

  it('returns 503 when plan cleanup is enabled but maintenance token is missing in production', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PLAN_CLEANUP_ENABLED', 'true');

    const response = await POST_PLAN_CLEANUP(createCleanupRequest());
    const body = (await response.json()) as { code?: string };

    expect(response.status).toBe(503);
    expect(body.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('rejects unauthorized requests when a worker token is configured', async () => {
    vi.stubEnv('MAINTENANCE_WORKER_TOKEN', WORKER_TOKEN);
    vi.stubEnv('PLAN_CLEANUP_ENABLED', 'true');

    const response = await POST_PLAN_CLEANUP(createCleanupRequest());

    expect(response.status).toBe(401);
  });

  it('returns 200 with ok:true when authenticated via Bearer token', async () => {
    vi.stubEnv('MAINTENANCE_WORKER_TOKEN', WORKER_TOKEN);
    vi.stubEnv('PLAN_CLEANUP_ENABLED', 'true');

    const response = await POST_PLAN_CLEANUP(
      createCleanupRequest({ token: WORKER_TOKEN }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      stuckPlansCleaned: number;
      orphanedAttemptsCleaned: number;
    };
    expect(body.ok).toBe(true);
    expect(body.stuckPlansCleaned).toEqual(expect.any(Number));
    expect(body.orphanedAttemptsCleaned).toEqual(expect.any(Number));
  });

  it('returns 200 with ok:true when authenticated via x-maintenance-worker-token', async () => {
    vi.stubEnv('MAINTENANCE_WORKER_TOKEN', WORKER_TOKEN);
    vi.stubEnv('PLAN_CLEANUP_ENABLED', 'true');

    const response = await POST_PLAN_CLEANUP(
      createCleanupRequest({ token: WORKER_TOKEN, useBearer: false }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('returns 500 when plan cleanup maintenance throws', async () => {
    vi.stubEnv('MAINTENANCE_WORKER_TOKEN', WORKER_TOKEN);
    vi.stubEnv('PLAN_CLEANUP_ENABLED', 'true');

    const maintenanceSpy = vi
      .spyOn(planCleanup, 'runPlanCleanupMaintenance')
      .mockRejectedValue(
        new Error(
          'Plan cleanup failed to mark all locked stuck plans as failed',
        ),
      );

    try {
      const response = await POST_PLAN_CLEANUP(
        createCleanupRequest({ token: WORKER_TOKEN }),
      );

      expect(response.status).toBe(500);
      const body = (await response.json()) as { error?: string };
      expect(body.error).toBeDefined();
    } finally {
      maintenanceSpy.mockRestore();
    }
  });

  it('runs plan cleanup and returns cleaned counts', async () => {
    vi.stubEnv('PLAN_CLEANUP_ENABLED', 'true');
    vi.stubEnv('MAINTENANCE_WORKER_TOKEN', '');

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

    const response = await POST_PLAN_CLEANUP(createCleanupRequest());

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
