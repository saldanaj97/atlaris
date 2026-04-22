import { classifyFailure } from '@/features/ai/classification';
import {
	cleanupTimeoutLifecycle,
	type TimeoutLifecycle,
} from '@/features/ai/orchestrator/timeout-lifecycle';
import { ProviderTimeoutError } from '@/features/ai/providers/errors';
import type {
	AttemptOperations,
	GenerationAttemptContext,
	GenerationAttemptRecordForResponse,
	GenerationFailureResult,
} from '@/features/ai/types/orchestrator.types';
import type { ProviderMetadata } from '@/features/ai/types/provider.types';
import type {
	AttemptReservation,
	AttemptsDbClient,
	FinalizeFailureParams,
} from '@/lib/db/queries/types/attempts.types';
import { logger } from '@/lib/logging/logger';
import type { FailureClassification } from '@/shared/types/client.types';

const SYNTHETIC_FAILURE_ATTEMPT_DEFAULTS = {
	id: null,
	status: 'failure',
	modulesCount: 0,
	tasksCount: 0,
	truncatedTopic: false,
	truncatedNotes: false,
	normalizedEffort: false,
	metadata: null,
} as const;

function toGenerationError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	if (typeof error === 'string' && error.trim().length > 0) {
		return new Error(error);
	}

	let detail: string;
	if (error && typeof error === 'object') {
		try {
			detail = JSON.stringify(error);
		} catch {
			detail = Object.prototype.toString.call(error);
		}
	} else if (
		typeof error === 'number' ||
		typeof error === 'boolean' ||
		typeof error === 'bigint' ||
		typeof error === 'symbol'
	) {
		detail = String(error);
	} else {
		detail = 'no additional detail';
	}

	return new Error(`Unknown generation error: ${detail}`);
}

export function createSyntheticFailureAttempt(params: {
	planId: string;
	classification: FailureClassification;
	durationMs: number;
	promptHash: string | null;
	now: () => Date;
}): GenerationAttemptRecordForResponse {
	const { planId, classification, durationMs, promptHash, now } = params;

	return {
		...SYNTHETIC_FAILURE_ATTEMPT_DEFAULTS,
		planId,
		classification,
		durationMs,
		promptHash,
		createdAt: now(),
	};
}

async function safelyFinalizeFailure(
	attemptOps: AttemptOperations,
	finalizeParams: FinalizeFailureParams,
	fallbackPromptHash: string,
): Promise<GenerationAttemptRecordForResponse> {
	try {
		return await attemptOps.finalizeAttemptFailure(finalizeParams);
	} catch (finalizeError) {
		logger.error(
			{
				planId: finalizeParams.planId,
				attemptId: finalizeParams.attemptId,
				finalizeError,
				originalError: finalizeParams.error,
			},
			'Failed to finalize generation attempt failure',
		);

		return createSyntheticFailureAttempt({
			planId: finalizeParams.planId,
			classification: finalizeParams.classification,
			durationMs: finalizeParams.durationMs,
			promptHash: fallbackPromptHash,
			now: finalizeParams.now ?? (() => new Date()),
		});
	}
}

export function createFailureResult(params: {
	classification: FailureClassification;
	error: Error;
	durationMs: number;
	extendedTimeout: boolean;
	timedOut: boolean;
	attempt: GenerationAttemptRecordForResponse;
	metadata?: ProviderMetadata;
	rawText?: string;
}): GenerationFailureResult {
	const { metadata, rawText, ...rest } = params;

	return {
		...rest,
		status: 'failure',
		...(metadata !== undefined && { metadata }),
		...(rawText !== undefined && { rawText }),
	};
}

export async function finalizeGenerationFailure(params: {
	error: unknown;
	reservation: AttemptReservation;
	attemptOps: AttemptOperations;
	context: GenerationAttemptContext;
	attemptClockStart: number;
	clock: () => number;
	nowFn: () => Date;
	dbClient: AttemptsDbClient;
	timeoutLifecycle?: TimeoutLifecycle;
	providerMetadata?: ProviderMetadata;
	rawText?: string;
}): Promise<GenerationFailureResult> {
	const {
		error,
		reservation,
		attemptOps,
		context,
		attemptClockStart,
		clock,
		nowFn,
		dbClient,
		timeoutLifecycle,
		providerMetadata,
		rawText,
	} = params;

	if (timeoutLifecycle) {
		cleanupTimeoutLifecycle(timeoutLifecycle);
	}

	const durationMs = Math.max(0, clock() - attemptClockStart);
	const normalizedError = toGenerationError(error);
	const timedOut =
		(timeoutLifecycle?.timeout.timedOut ?? false) ||
		normalizedError instanceof ProviderTimeoutError;
	const extendedTimeout = timeoutLifecycle?.timeout.didExtend ?? false;
	const classification = classifyFailure({
		error: normalizedError,
		timedOut,
	});

	const attempt = await safelyFinalizeFailure(
		attemptOps,
		{
			attemptId: reservation.attemptId,
			planId: context.planId,
			preparation: reservation,
			classification,
			durationMs,
			timedOut,
			extendedTimeout,
			providerMetadata,
			error: normalizedError,
			dbClient,
			now: nowFn,
		},
		reservation.promptHash,
	);

	return createFailureResult({
		classification,
		error: normalizedError,
		durationMs,
		extendedTimeout,
		timedOut,
		attempt,
		metadata: providerMetadata,
		rawText,
	});
}
