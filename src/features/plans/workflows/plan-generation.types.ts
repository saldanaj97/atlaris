import type {
  GenerationAttemptResult,
  ProcessGenerationInput,
} from '@/features/plans/lifecycle/types';
import type { AttemptReservation } from '@/lib/db/queries/types/attempts.types';
import type { GenerationInput } from '@/shared/types/ai-provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

export type SerializableAttemptReservation = {
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly startedAt: string;
  readonly promptHash: string;
  readonly sanitized: AttemptReservation['sanitized'];
};

export type PlanGenerationWorkflowInput = {
  readonly planId: string;
  readonly userId: string;
  readonly tier: SubscriptionTier;
  readonly input: GenerationInput;
  readonly modelOverride?: string | null;
  readonly correlationId: string;
  readonly reservation: SerializableAttemptReservation;
  readonly allowedGenerationStatuses?: ProcessGenerationInput['allowedGenerationStatuses'];
  readonly requiredGenerationStatus?: ProcessGenerationInput['requiredGenerationStatus'];
};

export type PlanGenerationWorkflowResult = GenerationAttemptResult;

export function toSerializableReservation(
  reservation: AttemptReservation,
): SerializableAttemptReservation {
  return {
    attemptId: reservation.attemptId,
    attemptNumber: reservation.attemptNumber,
    startedAt: reservation.startedAt.toISOString(),
    promptHash: reservation.promptHash,
    sanitized: reservation.sanitized,
  };
}

function parseReservationStartedAt(startedAt: string): Date {
  const parsed = Date.parse(startedAt);
  if (startedAt.trim() === '' || Number.isNaN(parsed)) {
    throw new Error(`Invalid reservation.startedAt: ${startedAt}`);
  }
  return new Date(parsed);
}

export function fromSerializableReservation(
  reservation: SerializableAttemptReservation,
): AttemptReservation {
  return {
    reserved: true,
    attemptId: reservation.attemptId,
    attemptNumber: reservation.attemptNumber,
    startedAt: parseReservationStartedAt(reservation.startedAt),
    promptHash: reservation.promptHash,
    sanitized: reservation.sanitized,
  };
}
