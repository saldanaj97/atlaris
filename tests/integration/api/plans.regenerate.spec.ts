import { POST } from '@/app/api/v1/plans/[planId]/regenerate/route';
import { requestPlanRegeneration } from '@/features/plans/regeneration-orchestration/request';
import { RateLimitError } from '@/lib/api/errors';
import { clearAllUserRateLimiters } from '@/lib/api/user-rate-limit';
import { setTestUser } from '@tests/helpers/auth';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@/features/plans/regeneration-orchestration/request',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/plans/regeneration-orchestration/request')
      >();
    return {
      ...actual,
      requestPlanRegeneration: vi.fn(),
    };
  },
);

const mockRequestPlanRegeneration = vi.mocked(requestPlanRegeneration);

const BASE_URL = 'http://localhost/api/v1/plans';

async function createRequest(planId: string, body: unknown) {
  return {
    request: new Request(`${BASE_URL}/${planId}/regenerate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    context: { params: Promise.resolve({ planId }) },
  };
}

describe('POST /api/v1/plans/:id/regenerate', () => {
  const authUserId = buildTestAuthUserId('api-regen-user');
  const authEmail = buildTestEmail(authUserId);
  let userId: string;

  beforeEach(async () => {
    clearAllUserRateLimiters();
    mockRequestPlanRegeneration.mockReset();
    setTestUser(authUserId);
    userId = await ensureUser({ authUserId, email: authEmail });
  });

  it('maps enqueued boundary result to 202 with rate limit headers', async () => {
    await ensureUser({
      authUserId,
      email: authEmail,
      subscriptionTier: 'pro',
    });

    const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    mockRequestPlanRegeneration.mockResolvedValue({
      kind: 'enqueued',
      jobId: 'job-1',
      planId,
      status: 'pending',
      planGenerationRateLimit: {
        remaining: 9,
        limit: 10,
        reset: 1_700_000_000,
      },
    });

    const { request, context } = await createRequest(planId, {
      overrides: { skillLevel: 'advanced' },
    });

    const res = await POST(request, context);
    expect(res.status).toBe(202);
    expect(res.headers.get('X-RateLimit-Remaining')).toEqual(
      expect.any(String),
    );

    const body = await res.json();
    expect(body.status).toBe('pending');
    expect(body.planId).toBe(planId);
    expect(body.jobId).toBe('job-1');
    expect(mockRequestPlanRegeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        planId,
        overrides: { skillLevel: 'advanced' },
      }),
    );
  });

  it('maps plan-not-found to 404', async () => {
    const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    mockRequestPlanRegeneration.mockResolvedValue({ kind: 'plan-not-found' });

    const { request, context } = await createRequest(planId, {
      overrides: { skillLevel: 'advanced' },
    });

    const res = await POST(request, context);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe('Learning plan not found.');
  });

  it('maps queue-disabled to 503', async () => {
    const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    mockRequestPlanRegeneration.mockResolvedValue({ kind: 'queue-disabled' });

    const { request, context } = await createRequest(planId, {
      overrides: { skillLevel: 'advanced' },
    });

    const res = await POST(request, context);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe(
      'Plan regeneration is temporarily disabled while queue workers are unavailable.',
    );
  });

  it('maps workflow-start-failed to its stable 503 error boundary', async () => {
    const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    mockRequestPlanRegeneration.mockResolvedValue({
      kind: 'workflow-start-failed',
      jobId: 'job-1',
      planId,
      retryable: true,
    });

    const { request, context } = await createRequest(planId, {
      overrides: { skillLevel: 'advanced' },
    });

    const response = await POST(request, context);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Failed to start plan regeneration workflow.',
      code: 'WORKFLOW_START_FAILED',
      details: { jobId: 'job-1', planId, retryable: true },
    });
  });

  it('maps active-job-conflict to 409 with job id', async () => {
    const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    mockRequestPlanRegeneration.mockResolvedValue({
      kind: 'active-job-conflict',
      existingJobId: 'existing-job',
    });

    const { request, context } = await createRequest(planId, {
      overrides: { skillLevel: 'advanced' },
    });

    const res = await POST(request, context);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('REGENERATION_ALREADY_QUEUED');
    expect(body.details?.jobId).toBe('existing-job');
  });

  it('maps queue-dedupe-conflict with reconciliation flag', async () => {
    const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    mockRequestPlanRegeneration.mockResolvedValue({
      kind: 'queue-dedupe-conflict',
      existingJobId: 'dup',
      reconciliationRequired: true,
    });

    const { request, context } = await createRequest(planId, {
      overrides: { skillLevel: 'advanced' },
    });

    const res = await POST(request, context);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.details?.reconciliationRequired).toBe(true);
    expect(body.details?.jobId).toBe('dup');
  });

  it('maps quota-denied to 429', async () => {
    const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    mockRequestPlanRegeneration.mockResolvedValue({
      kind: 'quota-denied',
      currentCount: 5,
      limit: 5,
      reason: 'Regeneration quota exceeded for your subscription tier.',
    });

    const { request, context } = await createRequest(planId, {
      overrides: { skillLevel: 'advanced' },
    });

    const res = await POST(request, context);
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.code).toBe('REGENERATION_QUOTA_EXCEEDED');
    expect(body.error).toBe(
      'Regeneration quota exceeded for your subscription tier.',
    );
  });

  it('maps not-included to 403 PLAN_REGENERATION_NOT_INCLUDED', async () => {
    const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    mockRequestPlanRegeneration.mockResolvedValue({ kind: 'not-included' });

    const { request, context } = await createRequest(planId, {});
    const res = await POST(request, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('PLAN_REGENERATION_NOT_INCLUDED');
  });

  it('maps duration-exceeded to 403 PLAN_DURATION_LIMIT_EXCEEDED', async () => {
    const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    mockRequestPlanRegeneration.mockResolvedValue({
      kind: 'duration-exceeded',
      reason: 'starter tier limited to 8-week plans.',
      upgradeUrl: '/pricing',
    });

    const { request, context } = await createRequest(planId, {});
    const res = await POST(request, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('PLAN_DURATION_LIMIT_EXCEEDED');
  });

  it('maps content-locked to 403 PLAN_ENTITLEMENT_REQUIRED', async () => {
    const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    mockRequestPlanRegeneration.mockResolvedValue({ kind: 'content-locked' });

    const { request, context } = await createRequest(planId, {});
    const res = await POST(request, context);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('PLAN_ENTITLEMENT_REQUIRED');
  });

  it('propagates RateLimitError from boundary as 429', async () => {
    const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    mockRequestPlanRegeneration.mockRejectedValue(
      new RateLimitError(
        `Rate limit exceeded. Maximum 5 plan generation requests allowed per 60 minutes.`,
        {
          retryAfter: 120,
          remaining: 0,
          limit: 5,
          reset: 1_700_000_000,
        },
      ),
    );

    const { request, context } = await createRequest(planId, {
      overrides: { skillLevel: 'advanced' },
    });

    const response = await POST(request, context);
    expect(response.status).toBe(429);
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');

    const body = await response.json();
    expect(body.code).toBe('RATE_LIMITED');
    expect(typeof body.retryAfter).toBe('number');
  });

  it('returns 400 with invalid JSON message when body is not JSON', async () => {
    await ensureUser({
      authUserId,
      email: authEmail,
      subscriptionTier: 'pro',
    });

    const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

    const request = new Request(`${BASE_URL}/${planId}/regenerate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    const context = { params: Promise.resolve({ planId }) };

    const res = await POST(request, context);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid JSON in request body.');
    expect(mockRequestPlanRegeneration).not.toHaveBeenCalled();
  });

  describe('invalid overrides schema', () => {
    it('rejects forged topic overrides', async () => {
      const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

      const { request, context } = await createRequest(planId, {
        overrides: { topic: 'forged topic' },
      });

      const res = await POST(request, context);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe('Invalid overrides.');
      expect(mockRequestPlanRegeneration).not.toHaveBeenCalled();
    });

    it('rejects invalid weeklyHours', async () => {
      const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

      const { request, context } = await createRequest(planId, {
        overrides: { weeklyHours: -5 },
      });

      const res = await POST(request, context);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe('Invalid overrides.');
    });

    it('rejects invalid skillLevel', async () => {
      const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

      const { request, context } = await createRequest(planId, {
        overrides: { skillLevel: 'expert' },
      });

      const res = await POST(request, context);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe('Invalid overrides.');
    });

    it('rejects extra fields in overrides', async () => {
      const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

      const { request, context } = await createRequest(planId, {
        overrides: { skillLevel: 'advanced', extraField: 'not allowed' },
      });

      const res = await POST(request, context);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe('Invalid overrides.');
    });

    it('forwards a valid regeneration model override on the job request', async () => {
      await ensureUser({
        authUserId,
        email: authEmail,
        subscriptionTier: 'pro',
      });
      const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      mockRequestPlanRegeneration.mockResolvedValue({
        kind: 'enqueued',
        jobId: 'job-model',
        planId,
        status: 'pending',
        planGenerationRateLimit: {
          remaining: 9,
          limit: 10,
          reset: 1_700_000_000,
        },
      });

      const { request, context } = await createRequest(planId, {
        overrides: { model: 'google/gemini-3-pro-preview' },
      });

      const res = await POST(request, context);
      expect(res.status).toBe(202);
      expect(mockRequestPlanRegeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          overrides: { model: 'google/gemini-3-pro-preview' },
        }),
      );
    });

    it('rejects an unknown regeneration model with MODEL_INVALID', async () => {
      await ensureUser({
        authUserId,
        email: authEmail,
        subscriptionTier: 'pro',
      });
      const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

      const { request, context } = await createRequest(planId, {
        overrides: { model: 'invalid/model-id' },
      });

      const res = await POST(request, context);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('MODEL_INVALID');
      expect(mockRequestPlanRegeneration).not.toHaveBeenCalled();
    });

    it('rejects a tier-denied regeneration model with MODEL_NOT_ALLOWED_FOR_TIER', async () => {
      await ensureUser({
        authUserId,
        email: authEmail,
        subscriptionTier: 'starter',
      });
      const planId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

      const { request, context } = await createRequest(planId, {
        overrides: { model: 'google/gemini-3-pro-preview' },
      });

      const res = await POST(request, context);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe('MODEL_NOT_ALLOWED_FOR_TIER');
      expect(mockRequestPlanRegeneration).not.toHaveBeenCalled();
    });
  });
});
