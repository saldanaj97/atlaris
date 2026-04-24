import {
	createFailureResult,
	createSyntheticFailureAttempt,
} from '@/features/ai/orchestrator/attempt-failures';
import type {
	GenerationAttemptContext,
	GenerationFailureResult,
} from '@/features/ai/types/orchestrator.types';
import type { AttemptRejection } from '@/lib/db/queries/types/attempts.types';
import { logger } from '@/lib/logging/logger';
import type { FailureClassification } from '@/shared/types/failure-classification.types';

const RESERVATION_REJECTION_DETAILS: Record<
	AttemptRejection['reason'],
	{
		classification: FailureClassification;
		message: (reservation: AttemptRejection) => string;
	}
> = {
	capped: {
		classification: 'capped',
		message: () => 'Generation attempt cap reached',
	},
	rate_limited: {
		classification: 'rate_limit',
		message: () => 'Generation rate limit exceeded for this user',
	},
	in_progress: {
		classification: 'rate_limit',
		message: () =>
			'A generation is already in progress for this plan (concurrent conflict)',
	},
	invalid_status: {
		classification: 'validation',
		message: (reservation) =>
			`Generation attempt is not allowed for plan status: ${reservation.currentStatus ?? 'unknown'}`,
	},
};

export function createReservationRejectionResult(
	context: GenerationAttemptContext,
	reservation: AttemptRejection,
	attemptClockStart: number,
	clock: () => number,
	nowFn: () => Date,
): GenerationFailureResult {
	const durationMs = Math.max(0, clock() - attemptClockStart);
	const rejectionDetails = RESERVATION_REJECTION_DETAILS[reservation.reason];
	const classification = rejectionDetails.classification;
	const errorMessage = rejectionDetails.message(reservation);

	const attempt = createSyntheticFailureAttempt({
		planId: context.planId,
		classification,
		durationMs,
		promptHash: null,
		now: nowFn,
	});

	logger.warn(
		{
			planId: context.planId,
			userId: context.userId,
			classification,
			errorMessage,
			reservationReason: reservation.reason,
			reservationCurrentStatus: reservation.currentStatus,
			attemptId: 'synthetic:no-db-row',
		},
		'Generation reservation rejected before attempt row creation',
	);

	return createFailureResult({
		classification,
		error: new Error(errorMessage),
		durationMs,
		extendedTimeout: false,
		timedOut: false,
		attempt,
	});
}
