import type { PlanGenerationWorkflowInput } from '@/features/plans/workflows/plan-generation.types';
import type { AttemptReservation } from '@/lib/db/queries/types/attempts.types';

import {
  fromSerializableReservation,
  toSerializableReservation,
} from '@/features/plans/workflows/plan-generation.types';
import {
  planGenerationStartCommandSchema,
  toPlanGenerationWorkflowInput,
} from '@/lib/jobs-worker/contract';
import { makeAttemptReservation } from '@tests/fixtures/attempts';
import { describe, expect, it } from 'vitest';

const ATTEMPT_ID = '5a0d7b6c-1e9f-4d8a-8b3c-2f1a0b9c8d74';

function workflowInput(
  reservation: AttemptReservation,
): PlanGenerationWorkflowInput {
  return {
    planId: '0b5e2c1d-6f4a-4e3b-9c8d-7a6b5c4d3e2f',
    userId: '2d7a4e3f-8b6c-4a5d-9e0f-9c8d7e6f5a41',
    tier: 'starter',
    input: {
      topic: 'TypeScript',
      notes: 'Focus on generics',
      skillLevel: 'intermediate',
      weeklyHours: 6,
      learningStyle: 'practice',
      startDate: '2026-10-12',
      deadlineDate: null,
    },
    generationPurpose: 'initial',
    modelOverride: 'openai/gpt-4o-mini',
    correlationId: 'req-1',
    reservation: toSerializableReservation(reservation),
    requiredGenerationStatus: 'generating',
  };
}

/** What the Worker sees: the app's input through a JSON request body. */
function overTheWire(input: PlanGenerationWorkflowInput) {
  const body = JSON.stringify({ v: 1, ...input });
  return toPlanGenerationWorkflowInput(
    planGenerationStartCommandSchema.parse(JSON.parse(body)),
  );
}

describe('plan-generation start command', () => {
  it.each([
    [
      'without notes',
      makeAttemptReservation({ attemptId: ATTEMPT_ID, admittedTier: 'free' }),
    ],
    [
      'with truncated notes',
      makeAttemptReservation({
        attemptId: ATTEMPT_ID,
        sanitized: {
          topic: { value: 'TypeScript', truncated: false, originalLength: 10 },
          notes: { value: 'Focus', truncated: true, originalLength: 2_000 },
        },
      }),
    ],
  ])('round-trips the reservation %s', (_label, reservation) => {
    const input = workflowInput(reservation);
    const received = overTheWire(input);

    expect(received).toEqual(input);
    expect(fromSerializableReservation(received.reservation)).toEqual(
      reservation,
    );
  });
});
