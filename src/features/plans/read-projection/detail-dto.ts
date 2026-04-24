import { buildPlanDetailStatusSnapshot } from '@/features/plans/read-projection/detail-status';
import { logger } from '@/lib/logging/logger';
import {
	ATTEMPT_STATUSES,
	type AttemptStatus,
	type ClientGenerationAttempt,
	type ClientPlanDetail,
} from '@/shared/types/client.types';
import type {
	GenerationAttempt,
	LearningPlanDetail,
} from '@/shared/types/db.types';
import {
	FAILURE_CLASSIFICATIONS,
	type FailureClassification,
} from '@/shared/types/failure-classification.types';

const VALID_ATTEMPT_STATUSES: ReadonlySet<AttemptStatus> = new Set(
	ATTEMPT_STATUSES,
);

const VALID_CLASSIFICATIONS: ReadonlySet<FailureClassification> = new Set(
	FAILURE_CLASSIFICATIONS,
);

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidAttemptStatus(status: string): status is AttemptStatus {
	return VALID_ATTEMPT_STATUSES.has(status as AttemptStatus);
}

function isValidFailureClassification(
	classification: string,
): classification is FailureClassification {
	return VALID_CLASSIFICATIONS.has(classification as FailureClassification);
}

function toAttemptStatus(status: string): AttemptStatus {
	if (isValidAttemptStatus(status)) {
		return status;
	}

	logger.warn(
		{ status },
		`[detailToClient] Unknown attempt status "${status}", falling back to "failure"`,
	);

	return 'failure';
}

function toClassification(
	classification: string | null | undefined,
): FailureClassification | null {
	if (!classification) {
		return null;
	}

	if (isValidFailureClassification(classification)) {
		return classification;
	}

	logger.warn(
		{ classification },
		`[detailToClient] Unknown failure classification "${classification}", returning null`,
	);

	return null;
}

function toClientAttempt(attempt: GenerationAttempt): ClientGenerationAttempt {
	const metadata = isRecord(attempt.metadata) ? attempt.metadata : null;

	let model: string | null = null;
	if (metadata && isRecord(metadata.provider)) {
		const provider = metadata.provider;
		if (typeof provider.model === 'string') {
			model = provider.model;
		}
	}

	const status = toAttemptStatus(attempt.status);

	if (status === 'success' && attempt.classification) {
		logger.warn(
			{ attemptId: attempt.id, classification: attempt.classification },
			'[detailToClient] Success attempt has unexpected classification',
		);
	}

	return {
		id: attempt.id,
		status,
		classification:
			status === 'failure' ? toClassification(attempt.classification) : null,
		durationMs: attempt.durationMs,
		modulesCount: attempt.modulesCount,
		tasksCount: attempt.tasksCount,
		truncatedTopic: attempt.truncatedTopic,
		truncatedNotes: attempt.truncatedNotes,
		normalizedEffort: attempt.normalizedEffort,
		promptHash: attempt.promptHash ?? null,
		metadata,
		model,
		createdAt: attempt.createdAt.toISOString(),
	} satisfies ClientGenerationAttempt;
}

export function toClientPlanDetail(
	detail: LearningPlanDetail | null | undefined,
): ClientPlanDetail | undefined {
	if (!detail) {
		return undefined;
	}

	if (!detail.plan) {
		logger.error(
			{
				attemptsCount: detail.attemptsCount,
				latestAttemptId: detail.latestAttempt?.id,
			},
			'LearningPlanDetail missing required plan payload',
		);
		throw new Error('LearningPlanDetail.plan is required.');
	}

	const modules = detail.plan.modules.map((planModule) => {
		const tasks = planModule.tasks.map((task) => ({
			id: task.id,
			order: task.order,
			title: task.title,
			description: task.description ?? null,
			estimatedMinutes: task.estimatedMinutes ?? 0,
			status: task.progress?.status ?? 'not_started',
			resources: task.resources.map((resource) => ({
				id: resource.id,
				order: resource.order,
				type: resource.resource.type,
				title: resource.resource.title,
				url: resource.resource.url,
				durationMinutes: resource.resource.durationMinutes ?? null,
			})),
		}));

		return {
			id: planModule.id,
			order: planModule.order,
			title: planModule.title,
			description: planModule.description ?? null,
			estimatedMinutes: planModule.estimatedMinutes ?? 0,
			tasks,
		};
	});

	const statusSnapshot = buildPlanDetailStatusSnapshot({
		plan: detail.plan,
		hasModules: modules.length > 0,
		attemptsCount: detail.attemptsCount,
		latestAttempt: detail.latestAttempt,
	});

	return {
		id: detail.plan.id,
		topic: detail.plan.topic,
		skillLevel: detail.plan.skillLevel,
		weeklyHours: detail.plan.weeklyHours,
		learningStyle: detail.plan.learningStyle,
		visibility: detail.plan.visibility,
		origin: detail.plan.origin,
		createdAt: detail.plan.createdAt
			? detail.plan.createdAt.toISOString()
			: undefined,
		modules,
		totalTasks: detail.totalTasks,
		completedTasks: detail.completedTasks,
		totalMinutes: detail.totalMinutes,
		completedMinutes: detail.completedMinutes,
		completedModules: detail.completedModules,
		status: statusSnapshot.status,
		latestAttempt: detail.latestAttempt
			? toClientAttempt(detail.latestAttempt)
			: null,
	} satisfies ClientPlanDetail;
}

export function toClientGenerationAttempts(
	attempts: GenerationAttempt[],
): ClientGenerationAttempt[] {
	return attempts.map(toClientAttempt);
}
