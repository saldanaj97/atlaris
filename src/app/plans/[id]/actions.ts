'use server';

/**
 * RLS enforcement note:
 * - RLS policies exist and are tested, but request/server actions currently use
 *   the service-role Drizzle client via getDb() unless a request-scoped RLS client
 *   is injected into the request context.
 * - Until an RLS-capable Drizzle client is available and wired, request-layer code
 *   must validate ownership in queries (e.g. batch updates via `applyTaskProgressUpdates`).
 *
 * Source of truth:
 * - src/lib/db/runtime.ts — getDb() returns the request-scoped DB when present,
 *   otherwise the service-role DB.
 * - src/lib/api/auth.ts — commentary on current non-RLS behavior in request handlers.
 */

import { revalidatePath } from 'next/cache';
import type { PlanAccessResult } from '@/app/plans/[id]/types';
import { getPlanDetailForRead } from '@/features/plans/read-projection';
import {
	applyTaskProgressUpdates,
	validateTaskProgressBatchInput,
} from '@/features/plans/task-progress';
import { requestBoundary } from '@/lib/api/request-boundary';
import { logger } from '@/lib/logging/logger';
import type { ProgressStatus } from '@/shared/types/db.types';
import { planError, planSuccess } from './helpers';

interface BatchUpdateTaskProgressInput {
	planId: string;
	updates: Array<{ taskId: string; status: ProgressStatus }>;
}

/**
 * Server action to batch update multiple task progress records from the plan overview page.
 * Delegates validation, scope checks, persistence, and path selection to `applyTaskProgressUpdates`.
 */
export async function batchUpdateTaskProgressAction({
	planId,
	updates,
}: BatchUpdateTaskProgressInput): Promise<void> {
	if (updates.length === 0) return;

	const result = await requestBoundary.action(async ({ actor, db }) => {
		validateTaskProgressBatchInput({ planId, updates });

		try {
			const outcome = await applyTaskProgressUpdates({
				userId: actor.id,
				planId,
				updates,
				dbClient: db,
			});
			for (const path of outcome.revalidatePaths) {
				revalidatePath(path);
			}
		} catch (error) {
			logger.error(
				{
					planId,
					userId: actor.id,
					updateCount: updates.length,
					taskIds: updates.map((update) => update.taskId),
					err: error,
				},
				'Failed to batch update task progress',
			);
			throw new Error('Unable to update task progress right now.');
		}
	});

	if (result === null) {
		throw new Error('You must be signed in to update progress.');
	}
}

/**
 * Server action to fetch plan detail data with RLS enforcement.
 * Returns a typed result with explicit error codes for proper handling.
 *
 * Error codes:
 * - UNAUTHORIZED: User is not authenticated
 * - NOT_FOUND: Plan does not exist or user doesn't have access
 * - INTERNAL_ERROR: Unexpected error during fetch
 */
export async function getPlanForPage(
	planId: string,
): Promise<PlanAccessResult> {
	const boundaryResult = await requestBoundary.action(async ({ actor, db }) => {
		const plan = await getPlanDetailForRead({
			planId,
			userId: actor.id,
			dbClient: db,
		});
		if (!plan) {
			logger.debug(
				{ planId, userId: actor.id },
				'Plan not found or user does not have access',
			);
			return planError(
				'NOT_FOUND',
				'This plan does not exist or you do not have access to it.',
			);
		}
		return planSuccess(plan);
	});

	if (!boundaryResult) {
		logger.debug({ planId }, 'Plan access denied: user not authenticated');
		return planError(
			'UNAUTHORIZED',
			'You must be signed in to view this plan.',
		);
	}
	return boundaryResult;
}
