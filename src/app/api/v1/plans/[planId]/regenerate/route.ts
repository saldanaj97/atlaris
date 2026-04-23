import { ZodError } from 'zod';
import { requirePlanIdFromRequest } from '@/features/plans/api/route-context';
import { requestPlanRegeneration } from '@/features/plans/regeneration-orchestration';
import { planRegenerationRequestSchema } from '@/features/plans/validation/learningPlans';
import type { PlanRegenerationOverridesInput } from '@/features/plans/validation/learningPlans.types';
import type { PlainHandler } from '@/lib/api/auth';
import {
	AppError,
	NotFoundError,
	RateLimitError,
	ValidationError,
} from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { getPlanGenerationRateLimitHeaders } from '@/lib/api/rate-limit';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { regenerationQueueEnv } from '@/lib/config/env';

/**
 * POST /api/v1/plans/:planId/regenerate
 * Enqueues a regeneration job for an existing plan with optional parameter overrides.
 */
export const POST: PlainHandler = withErrorBoundary(
	requestBoundary.route(
		{ rateLimit: 'aiGeneration' },
		async ({ req, actor }) => {
			const planId = requirePlanIdFromRequest(req, 'second-to-last');

			const body = await parseJsonBody(req, {
				mode: 'required',
				onMalformedJson: () =>
					new ValidationError('Invalid JSON in request body.'),
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

			const result = await requestPlanRegeneration({
				userId: actor.id,
				planId,
				overrides,
				inlineProcessingEnabled: regenerationQueueEnv.inlineProcessingEnabled,
			});

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
					throw new RateLimitError(
						'Regeneration quota exceeded for your subscription tier.',
						{
							remaining: Math.max(0, result.limit - result.currentCount),
							limit: result.limit,
						},
					);
				case 'enqueued':
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
				default: {
					const _exhaustive: never = result;
					return _exhaustive;
				}
			}
		},
	),
);
