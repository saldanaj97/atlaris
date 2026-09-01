import type { PlanRegenerationOverridesInput } from '@/features/plans/validation/learningPlans.types';
import type { PlainHandler } from '@/lib/api/auth';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { validateModelForTier } from '@/features/ai/model-resolver';
import { requireUuidRouteParam } from '@/features/plans/api/route-context';
import { throwPlanEntitlementRequired } from '@/features/plans/entitlement/errors';
import { createDefaultRegenerationOrchestrationDeps } from '@/features/plans/regeneration-orchestration/deps';
import { requestPlanRegeneration } from '@/features/plans/regeneration-orchestration/request';
import { planRegenerationRequestSchema } from '@/features/plans/validation/learningPlans';
import { AppError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { getPlanGenerationRateLimitHeaders } from '@/lib/api/rate-limit';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { captureAfterResponse } from '@/lib/posthog-server';
import {
  API_ERROR_CODES,
  API_ERROR_HTTP_STATUS,
} from '@/shared/constants/api-error-codes';
import { ZodError } from 'zod';

function assertRegenerationModelAllowed(
  tier: SubscriptionTier,
  model: string | undefined,
): void {
  if (model === undefined) {
    return;
  }

  const validation = validateModelForTier(tier, model, 'regeneration');
  if (validation.valid) {
    return;
  }

  switch (validation.reason) {
    case 'invalid_model':
      throw new AppError('Model is not recognized.', {
        status: 400,
        code: 'MODEL_INVALID',
        details: { model },
      });
    case 'tier_denied':
      throw new AppError('Model is not allowed for your subscription tier.', {
        status: 403,
        code: 'MODEL_NOT_ALLOWED_FOR_TIER',
        details: { model, tier },
      });
    default: {
      const _never: never = validation.reason;
      throw new AppError('Model validation failed for an unexpected reason.', {
        status: 500,
        code: 'UNKNOWN_MODEL_VALIDATION_REASON',
        details: { reason: String(_never), model },
      });
    }
  }
}

/**
 * POST /api/v1/plans/:planId/regenerate
 * Enqueues a regeneration job for an existing plan with optional parameter overrides.
 */
export const POST: PlainHandler = requestBoundary.route(
  { rateLimit: 'aiGeneration' },
  async ({ req, params, actor, db }) => {
    const planId = requireUuidRouteParam(params, 'planId');

    const body = await parseJsonBody(req, {
      mode: 'required',
      onMalformedJson: () =>
        new ValidationError('Invalid JSON in request body.'),
      maxBytes: 1 * 1024 * 1024,
    });

    let overrides: PlanRegenerationOverridesInput | undefined;
    try {
      const parsed = planRegenerationRequestSchema.parse(body);
      overrides = parsed.overrides;
    } catch (err: unknown) {
      const errDetail = err instanceof Error ? err : new Error(String(err));
      const serializableCause = `${errDetail.name}: ${errDetail.message}`;
      if (err instanceof ZodError) {
        throw new ValidationError('Invalid overrides.', {
          cause: serializableCause,
          fieldErrors: err.flatten(),
        });
      }
      throw new ValidationError('Invalid overrides.', {
        cause: serializableCause,
      });
    }

    assertRegenerationModelAllowed(actor.subscriptionTier, overrides?.model);

    const result = await requestPlanRegeneration(
      {
        userId: actor.id,
        planId,
        overrides,
      },
      createDefaultRegenerationOrchestrationDeps(db),
    );

    switch (result.kind) {
      case 'queue-disabled':
        throw new AppError(
          'Plan regeneration is temporarily disabled while queue workers are unavailable.',
          {
            status: 503,
            code: 'SERVICE_UNAVAILABLE',
          },
        );
      case 'plan-not-found':
        throw new NotFoundError('Learning plan not found.');
      case 'active-job-conflict':
      case 'queue-dedupe-conflict': {
        const reconciliationRequired =
          result.kind === 'queue-dedupe-conflict' &&
          result.reconciliationRequired;
        throw new AppError(
          'A regeneration job is already queued for this plan.',
          {
            status: 409,
            code: 'REGENERATION_ALREADY_QUEUED',
            details: {
              jobId: result.existingJobId,
              ...(reconciliationRequired && {
                reconciliationRequired: true,
              }),
            },
          },
        );
      }
      case 'quota-denied':
        throw new AppError(
          'Regeneration quota exceeded for your subscription tier.',
          {
            status: API_ERROR_HTTP_STATUS.REGENERATION_QUOTA_EXCEEDED,
            code: API_ERROR_CODES.REGENERATION_QUOTA_EXCEEDED,
            classification: 'rate_limit',
            details: {
              remaining: Math.max(0, result.limit - result.currentCount),
              limit: result.limit,
            },
          },
        );
      case 'not-included':
        throw new AppError(
          'Plan regeneration is not included on the Free plan.',
          {
            status: API_ERROR_HTTP_STATUS.PLAN_REGENERATION_NOT_INCLUDED,
            code: API_ERROR_CODES.PLAN_REGENERATION_NOT_INCLUDED,
            details: { upgradeUrl: '/pricing' },
          },
        );
      case 'duration-exceeded':
        throw new AppError(result.reason, {
          status: API_ERROR_HTTP_STATUS.PLAN_DURATION_LIMIT_EXCEEDED,
          code: API_ERROR_CODES.PLAN_DURATION_LIMIT_EXCEEDED,
          details: { upgradeUrl: result.upgradeUrl ?? '/pricing' },
        });
      case 'content-locked':
        throwPlanEntitlementRequired();
      case 'workflow-start-failed':
        throw new AppError('Failed to start plan regeneration workflow.', {
          status: 503,
          code: 'WORKFLOW_START_FAILED',
          details: {
            jobId: result.jobId,
            planId: result.planId,
            retryable: result.retryable,
          },
        });
      case 'enqueued': {
        captureAfterResponse(actor, 'plan_regeneration_requested', {
          plan_id: planId,
          job_id: result.jobId,
          has_overrides: overrides !== undefined,
        });
        return json(
          {
            planId,
            jobId: result.jobId,
            status: 'pending',
          },
          {
            status: 202,
            headers: getPlanGenerationRateLimitHeaders(
              result.planGenerationRateLimit,
            ),
          },
        );
      }
      default: {
        const _exhaustive: never = result;
        return _exhaustive;
      }
    }
  },
);
