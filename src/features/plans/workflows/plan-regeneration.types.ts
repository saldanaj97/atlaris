import type { SerializableAttemptReservation } from './plan-generation.types';
import type { GenerationInput } from '@/shared/types/ai-provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  parseGenerationPurpose,
  type GenerationPurpose,
} from '@/shared/types/generation-purpose';

export type PlanRegenerationWorkflowInput = {
  readonly jobId: string;
  readonly planId: string;
  readonly userId: string;
  readonly correlationId: string;
  readonly generationPurpose?: GenerationPurpose;
};

/** Validated admission context carried with a reservation across workflow steps. */
export type PlanRegenerationAttemptPreparation = {
  readonly reservation: SerializableAttemptReservation;
  readonly tier: SubscriptionTier;
  readonly generationInput: GenerationInput;
  readonly modelOverride?: string;
};

export type PlanRegenerationReservationStepResult =
  | PlanRegenerationAttemptPreparation
  | PlanRegenerationWorkflowTerminalResult;

export function resolvePlanRegenerationWorkflowPurpose(
  input: Pick<PlanRegenerationWorkflowInput, 'generationPurpose'>,
): GenerationPurpose {
  if (input.generationPurpose === undefined) {
    return 'regeneration';
  }

  const parsed = parseGenerationPurpose(input.generationPurpose);
  switch (parsed) {
    case 'regeneration':
      return parsed;
    case 'initial':
      throw new Error(
        `Invalid generation purpose: ${parsed} (expected regeneration)`,
      );
    default: {
      const _never: never = parsed;
      throw new Error(`Unhandled generation purpose: ${String(_never)}`);
    }
  }
}

export type PlanRegenerationWorkflowClaimResult =
  | { readonly kind: 'claimed'; readonly runId: string }
  | { readonly kind: 'already-completed'; readonly jobId: string }
  | { readonly kind: 'already-failed'; readonly jobId: string }
  | {
      readonly kind: 'in-flight';
      readonly jobId: string;
      readonly runId: string;
    }
  | { readonly kind: 'invalid-payload'; readonly jobId: string }
  | { readonly kind: 'job-not-found'; readonly jobId: string };

export type PlanRegenerationWorkflowTerminalResult =
  | {
      readonly kind: 'completed';
      readonly jobId: string;
      readonly planId: string;
    }
  | {
      readonly kind: 'retryable-failure';
      readonly jobId: string;
      readonly planId: string;
      readonly willRetry: boolean;
    }
  | {
      readonly kind: 'permanent-failure';
      readonly jobId: string;
      readonly planId: string;
    }
  | {
      readonly kind: 'already-finalized';
      readonly jobId: string;
      readonly planId: string;
    };

export type PlanRegenerationWorkflowResult =
  | PlanRegenerationWorkflowClaimResult
  | PlanRegenerationWorkflowTerminalResult;
