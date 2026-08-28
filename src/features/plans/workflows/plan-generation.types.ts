import type {
  GenerationAttemptResult,
  ProcessGenerationInput,
} from '@/features/plans/lifecycle/types';
import type { AttemptReservation } from '@/lib/db/queries/types/attempts.types';
import type { GenerationInput } from '@/shared/types/ai-provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  parseGenerationPurpose,
  resolveLegacyWorkflowGenerationPurpose,
  type GenerationPurpose,
} from '@/shared/types/generation-purpose';

export type SerializableAttemptReservation = {
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly startedAt: string;
  readonly admittedTier?: SubscriptionTier;
  readonly promptHash: string;
  readonly sanitized: AttemptReservation['sanitized'];
  readonly generationPurpose?: GenerationPurpose;
};

export type PlanGenerationWorkflowInput = {
  readonly planId: string;
  readonly userId: string;
  readonly tier: SubscriptionTier;
  readonly input: GenerationInput;
  readonly generationPurpose?: GenerationPurpose;
  readonly modelOverride?: string | null;
  readonly correlationId: string;
  readonly reservation: SerializableAttemptReservation;
  readonly allowedGenerationStatuses?: ProcessGenerationInput['allowedGenerationStatuses'];
  readonly requiredGenerationStatus?: ProcessGenerationInput['requiredGenerationStatus'];
};

export type PlanGenerationWorkflowResult = GenerationAttemptResult;

export function resolvePlanGenerationWorkflowPurpose(
  input: Pick<PlanGenerationWorkflowInput, 'generationPurpose'>,
): GenerationPurpose {
  if (input.generationPurpose === undefined) {
    return 'initial';
  }

  const parsed = parseGenerationPurpose(input.generationPurpose);
  switch (parsed) {
    case 'initial':
      return parsed;
    case 'regeneration':
      throw new Error(
        `Invalid generation purpose: ${parsed} (expected initial)`,
      );
    default: {
      const _never: never = parsed;
      throw new Error(`Unhandled generation purpose: ${String(_never)}`);
    }
  }
}

export function toSerializableReservation(
  reservation: AttemptReservation,
): SerializableAttemptReservation {
  return {
    attemptId: reservation.attemptId,
    attemptNumber: reservation.attemptNumber,
    startedAt: reservation.startedAt.toISOString(),
    ...(reservation.admittedTier
      ? { admittedTier: reservation.admittedTier }
      : {}),
    promptHash: reservation.promptHash,
    sanitized: reservation.sanitized,
    generationPurpose: reservation.generationPurpose,
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
  fallbackPurpose: GenerationPurpose = 'initial',
): AttemptReservation {
  return {
    reserved: true,
    attemptId: reservation.attemptId,
    attemptNumber: reservation.attemptNumber,
    startedAt: parseReservationStartedAt(reservation.startedAt),
    ...(reservation.admittedTier
      ? { admittedTier: reservation.admittedTier }
      : {}),
    promptHash: reservation.promptHash,
    sanitized: reservation.sanitized,
    generationPurpose: resolveLegacyWorkflowGenerationPurpose(
      reservation.generationPurpose,
      fallbackPurpose,
    ),
  };
}
