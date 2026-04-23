import { classificationToUserMessage } from '@/features/ai/failure-presentation';
import { requirePlanIdFromRequest } from '@/features/plans/api/route-context';
import { getPlanGenerationStatusSnapshot } from '@/features/plans/read-projection';
import { withAuthAndRateLimit } from '@/lib/api/auth';
import { NotFoundError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/middleware';
import { json } from '@/lib/api/response';
import { getDb } from '@/lib/db/runtime';
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
	withAuthAndRateLimit('read', async ({ req, user }): Promise<Response> => {
		const planId = requirePlanIdFromRequest(req, 'second-to-last');
		const dbClient = getDb();

		logger.debug({ planId, userId: user.id }, 'Plan status request received');

		const statusSnapshot = await getPlanGenerationStatusSnapshot({
			planId,
			userId: user.id,
			dbClient,
		});

		if (!statusSnapshot) {
			throw new NotFoundError('Learning plan not found.');
		}

		logger.debug(
			{
				planId,
				userId: user.id,
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
					userId: user.id,
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
	}),
);
