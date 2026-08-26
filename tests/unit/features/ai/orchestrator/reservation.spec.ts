import { createReservationRejectionResult } from '@/features/ai/orchestrator/reservation';
import { AppError } from '@/lib/api/errors';
import {
  API_ERROR_CODES,
  API_ERROR_HTTP_STATUS,
} from '@/shared/constants/api-error-codes';
import { describe, expect, it } from 'vitest';

const context = {
  planId: 'plan-1',
  userId: 'user-1',
  input: {
    topic: 'rust',
    skillLevel: 'beginner' as const,
    weeklyHours: 5,
    learningStyle: 'mixed' as const,
  },
  generationPurpose: 'initial' as const,
};

describe('createReservationRejectionResult', () => {
  it('maps free_allowance_used to FREE_PLAN_ALLOWANCE_USED', () => {
    const result = createReservationRejectionResult(
      context,
      { reserved: false, reason: 'free_allowance_used' },
      0,
      () => 10,
      () => new Date('2026-08-26T00:00:00.000Z'),
    );
    expect(result.error).toBeInstanceOf(AppError);
    expect((result.error as AppError).code()).toBe(
      API_ERROR_CODES.FREE_PLAN_ALLOWANCE_USED,
    );
    expect((result.error as AppError).status()).toBe(
      API_ERROR_HTTP_STATUS.FREE_PLAN_ALLOWANCE_USED,
    );
  });

  it('maps free_initial_in_progress to FREE_PLAN_GENERATION_IN_PROGRESS', () => {
    const result = createReservationRejectionResult(
      context,
      { reserved: false, reason: 'free_initial_in_progress' },
      0,
      () => 10,
      () => new Date('2026-08-26T00:00:00.000Z'),
    );
    expect((result.error as AppError).code()).toBe(
      API_ERROR_CODES.FREE_PLAN_GENERATION_IN_PROGRESS,
    );
    expect((result.error as AppError).status()).toBe(
      API_ERROR_HTTP_STATUS.FREE_PLAN_GENERATION_IN_PROGRESS,
    );
  });
});
