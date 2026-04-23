import { classificationToUserMessage } from '@/features/ai/failure-presentation';
import { requirePlanIdFromRequest } from '@/features/plans/api/route-context';
import { getPlanGenerationStatusSnapshot } from '@/features/plans/read-projection';
import { NotFoundError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';
import { PlanStatusResponseSchema } from '@/shared/schemas/plan-status';

/**
 * GET /api/v1/plans/:planId/status
 * Returns the status of a learning plan's generation process.
 *
 * Uses learning_plans.generationStatus column (updated by streaming route)
 * instead of the legacy job_queue table.
 */

export const GET = withErrorBoundary(
	requestBoundary.route(
		{ rateLimit: 'read' },
		async ({ req, actor, db }): Promise<Response> => {
			const planId = requirePlanIdFromRequest(req, 'second-to-last');

			logger.debug(
				{ planId, userId: actor.id },
				'Plan status request received',
			);

			const statusSnapshot = await getPlanGenerationStatusSnapshot({
				planId,
				userId: actor.id,
				dbClient: db,
			});

			if (!statusSnapshot) {
				throw new NotFoundError('Learning plan not found.');
			}

			logger.debug(
				{
					planId,
					userId: actor.id,
					status: statusSnapshot.status,
					attempts: statusSnapshot.attempts,
				},
				'Plan status response',
			);

			let latestError: string | null = null;
			if (statusSnapshot.status === 'failed') {
				latestError = classificationToUserMessage(
					statusSnapshot.latestClassification ?? 'unknown',
				);
				logger.warn(
					{
						planId,
						userId: actor.id,
						status: statusSnapshot.status,
						attempts: statusSnapshot.attempts,
						classification: statusSnapshot.latestClassification,
						latestError,
					},
					'Plan generation failed',
				);
			}

			const body = PlanStatusResponseSchema.parse({
				planId: statusSnapshot.planId,
				status: statusSnapshot.status,
				attempts: statusSnapshot.attempts,
				latestError,
				createdAt: statusSnapshot.createdAt,
				updatedAt: statusSnapshot.updatedAt,
			});

			return json(body, {
				headers: { 'Cache-Control': 'max-age=1, stale-while-revalidate=2' },
			});
		},
	),
);
