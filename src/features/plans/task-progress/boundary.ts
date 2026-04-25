import { setTaskProgressBatch } from '@/lib/db/queries/tasks';
import { PROGRESS_STATUSES } from '@/shared/types/db';
import type { ProgressStatus } from '@/shared/types/db.types';

import type {
	ApplyTaskProgressUpdatesInput,
	TaskProgressUpdate,
	TaskProgressUpdateResult,
	TaskProgressVisibleState,
} from './types';

export const TASK_PROGRESS_MAX_BATCH = 500;

function assertNonEmpty(value: string | undefined, message: string) {
	if (!value || value.trim().length === 0) {
		throw new Error(message);
	}
}

function getDuplicateTaskIds(updates: TaskProgressUpdate[]): string[] {
	return Array.from(
		updates.reduce((counts, update) => {
			const taskId = update.taskId?.trim() ?? '';
			counts.set(taskId, (counts.get(taskId) ?? 0) + 1);
			return counts;
		}, new Map<string, number>()),
	)
		.filter(([taskId, count]) => taskId.length > 0 && count > 1)
		.map(([taskId]) => taskId);
}

export function validateTaskProgressBatchInput(params: {
	planId: string;
	moduleId?: string;
	updates: TaskProgressUpdate[];
}): void {
	assertNonEmpty(params.planId, 'A plan id is required to update progress.');
	if (params.moduleId !== undefined) {
		assertNonEmpty(
			params.moduleId,
			'A module id is required to update progress.',
		);
	}
	if (params.updates.length > TASK_PROGRESS_MAX_BATCH) {
		throw new Error(
			`Batch update limit exceeded: received ${params.updates.length} updates, but the maximum allowed is ${TASK_PROGRESS_MAX_BATCH}.`,
		);
	}

	const duplicateTaskIds = getDuplicateTaskIds(params.updates);
	if (duplicateTaskIds.length > 0) {
		throw new Error(
			`Duplicate taskIds in updates: ${duplicateTaskIds.join(', ')}`,
		);
	}

	for (const [index, update] of params.updates.entries()) {
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
}

/** Persists validated updates after scope checks. */
export async function applyTaskProgressUpdates(
	input: ApplyTaskProgressUpdatesInput,
): Promise<TaskProgressUpdateResult> {
	validateTaskProgressBatchInput({
		planId: input.planId,
		moduleId: input.moduleId,
		updates: input.updates,
	});

	if (input.updates.length === 0) {
		return {
			progress: [],
			revalidatePaths: [],
			visibleState: { appliedByTaskId: {} },
		};
	}

	const progress = await setTaskProgressBatch(
		input.userId,
		input.updates,
		input.dbClient,
		{
			planId: input.planId,
			moduleId: input.moduleId,
			...(input.now === undefined ? {} : { now: input.now }),
		},
	);

	const appliedByTaskId: Record<string, ProgressStatus> = {};
	for (const row of progress) {
		appliedByTaskId[row.taskId] = row.status as ProgressStatus;
	}

	const visibleState: TaskProgressVisibleState = { appliedByTaskId };

	const revalidatePaths =
		input.moduleId !== undefined
			? [
					`/plans/${input.planId}/modules/${input.moduleId}`,
					`/plans/${input.planId}`,
					'/plans',
				]
			: [`/plans/${input.planId}`, '/plans'];

	return { progress, revalidatePaths, visibleState };
}
