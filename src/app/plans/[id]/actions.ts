'use server';

/**
 * RLS enforcement note:
 * - RLS policies exist and are tested, but request/server actions currently use
 *   the service-role Drizzle client via getDb() unless a request-scoped RLS client
 *   is injected into the request context.
 * - Until an RLS-capable Drizzle client is available and wired, request-layer code
 *   must validate ownership in queries (e.g., batch updates via `setTaskProgressBatch`).
 *
 * Source of truth:
 * - src/lib/db/runtime.ts — getDb() returns the request-scoped DB when present,
 *   otherwise the service-role DB.
 * - src/lib/api/auth.ts — commentary on current non-RLS behavior in request handlers.
 */

import { revalidatePath } from 'next/cache';
import {
	logger,
	PROGRESS_STATUSES,
	type ProgressStatus,
	setTaskProgressBatch,
} from '@/app/plans/[id]/server/task-progress-action-deps';
import type { PlanAccessResult } from '@/app/plans/[id]/types';
import { getPlanDetailForRead } from '@/features/plans/read-service';
import { requestBoundary } from '@/lib/api/request-boundary';
import { planError, planSuccess } from './helpers';

interface BatchUpdateTaskProgressInput {
	planId: string;
	updates: Array<{ taskId: string; status: ProgressStatus }>;
}

const MAX_BATCH_UPDATES = 500;

function assertNonEmpty(value: string | undefined, message: string) {
	if (!value || value.trim().length === 0) {
		throw new Error(message);
	}
}

/**
 * Server action to batch update multiple task progress records from the plan overview page.
 * Validates all updates, persists via `setTaskProgressBatch`, and revalidates affected paths.
 */
export async function batchUpdateTaskProgressAction({
	planId,
	updates,
}: BatchUpdateTaskProgressInput): Promise<void> {
	assertNonEmpty(planId, 'A plan id is required to update progress.');
	if (updates.length === 0) return;
	if (updates.length > MAX_BATCH_UPDATES) {
		throw new Error(
			`Batch update limit exceeded: received ${updates.length} updates, but the maximum allowed is ${MAX_BATCH_UPDATES}.`,
		);
	}

	for (const [index, update] of updates.entries()) {
		const taskId = update.taskId?.trim() ?? '';
		assertNonEmpty(
			taskId,
			`A task id is required to update progress for update at index ${index} (taskId="${taskId || '<missing>'}", status="${update.status}").`,
		);
		if (!PROGRESS_STATUSES.includes(update.status)) {
			throw new Error(
				`Invalid progress status for update at index ${index} (taskId="${taskId}", status="${update.status}").`,
			);
		}
	}

	const result = await requestBoundary.action(async ({ actor, db }) => {
		try {
			await setTaskProgressBatch(actor.id, updates, db);
			revalidatePath(`/plans/${planId}`);
			revalidatePath('/plans');
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
	const result = await requestBoundary.action(async ({ actor, db }) => {
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

	if (!result) {
		logger.debug({ planId }, 'Plan access denied: user not authenticated');
		return planError(
			'UNAUTHORIZED',
			'You must be signed in to view this plan.',
		);
	}
	return result;
}
