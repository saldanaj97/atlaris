import { and, eq } from 'drizzle-orm';
import {
	prepareRlsTransactionContext,
	reapplyJwtClaimsInTransaction,
} from '@/lib/db/queries/helpers/rls-jwt-claims';
import type {
	AttemptReservation,
	FinalizeSuccessPersistenceParams,
	GenerationAttemptRecord,
	NormalizedModuleData,
} from '@/lib/db/queries/types/attempts.types';
import { generationAttempts, modules, tasks } from '@/lib/db/schema';

type TaskInsertValue = {
	moduleId: string;
	order: number;
	title: string;
	description: string | null;
	estimatedMinutes: number;
};

export function assertAttemptIdMatchesReservation(
	attemptId: string,
	preparation: AttemptReservation,
): void {
	if (attemptId !== preparation.attemptId) {
		throw new Error('Attempt ID mismatch between params and reserved attempt.');
	}
}

export async function persistSuccessfulAttempt(
	params: FinalizeSuccessPersistenceParams,
): Promise<GenerationAttemptRecord> {
	const {
		attemptId,
		planId,
		preparation,
		normalizedModules,
		normalizationFlags,
		modulesCount,
		tasksCount,
		durationMs,
		metadata,
		dbClient,
	} = params;

	const rlsCtx = await prepareRlsTransactionContext(dbClient);

	return dbClient.transaction(async (tx) => {
		await reapplyJwtClaimsInTransaction(tx, rlsCtx);

		await tx.delete(modules).where(eq(modules.planId, planId));

		const moduleValues = normalizedModules.map(
			(normalizedModule: NormalizedModuleData, index: number) => ({
				planId,
				order: index + 1,
				title: normalizedModule.title,
				description: normalizedModule.description,
				estimatedMinutes: normalizedModule.estimatedMinutes,
			}),
		);
		const insertedModuleRows =
			moduleValues.length > 0
				? await tx
						.insert(modules)
						.values(moduleValues)
						.returning({ id: modules.id })
				: [];

		if (insertedModuleRows.length !== normalizedModules.length) {
			throw new Error(
				`Failed to insert generated modules for attempt ${attemptId}: expected ${normalizedModules.length}, inserted ${insertedModuleRows.length}.`,
			);
		}

		const taskValues: TaskInsertValue[] = insertedModuleRows.flatMap(
			(moduleRow, moduleIndex) => {
				const moduleEntry = normalizedModules[moduleIndex];

				if (!moduleEntry) {
					throw new Error(
						`Failed to map inserted module ${moduleIndex + 1} to generated tasks for attempt ${attemptId}.`,
					);
				}

				return moduleEntry.tasks.map((task, taskIndex) => ({
					moduleId: moduleRow.id,
					order: taskIndex + 1,
					title: task.title,
					description: task.description,
					estimatedMinutes: task.estimatedMinutes,
				}));
			},
		);

		if (taskValues.length > 0) {
			const insertedTaskRows = await tx
				.insert(tasks)
				.values(taskValues)
				.returning({ id: tasks.id });

			if (insertedTaskRows.length !== taskValues.length) {
				throw new Error(
					`Failed to insert generated tasks for attempt ${attemptId}: expected ${taskValues.length}, inserted ${insertedTaskRows.length}.`,
				);
			}
		}

		const [attempt] = await tx
			.update(generationAttempts)
			.set({
				status: 'success',
				classification: null,
				durationMs: Math.max(0, Math.round(durationMs)),
				modulesCount,
				tasksCount,
				truncatedTopic: preparation.sanitized.topic.truncated,
				truncatedNotes: preparation.sanitized.notes.truncated ?? false,
				normalizedEffort:
					normalizationFlags.modulesClamped || normalizationFlags.tasksClamped,
				metadata,
			})
			.where(
				and(
					eq(generationAttempts.id, attemptId),
					eq(generationAttempts.planId, planId),
					eq(generationAttempts.status, 'in_progress'),
				),
			)
			.returning();

		if (!attempt) {
			throw new Error(
				`Failed to finalize successful generation attempt ${attemptId} for plan ${planId}; attempt was not in progress.`,
			);
		}

		return attempt;
	});
}
