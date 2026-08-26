import { throwCreatePlanResultError } from '@/features/plans/session/create-plan-result-error';
import { AppError } from '@/lib/api/errors';
import {
  API_ERROR_CODES,
  API_ERROR_HTTP_STATUS,
} from '@/shared/constants/api-error-codes';
import { describe, expect, it } from 'vitest';

function expectThrownAppError(
  run: () => never,
  expected: { status: number; code: string },
) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    if (!(error instanceof AppError)) {
      throw error;
    }
    expect(error.status()).toBe(expected.status);
    expect(error.code()).toBe(expected.code);
    return;
  }
  throw new Error('expected AppError');
}

describe('throwCreatePlanResultError', () => {
  it('maps Free lifetime admission denials to the documented codes', () => {
    expectThrownAppError(
      () =>
        throwCreatePlanResultError({
          status: 'free_allowance_used',
          reason: 'used',
          upgradeUrl: '/pricing',
        }),
      {
        status: API_ERROR_HTTP_STATUS.FREE_PLAN_ALLOWANCE_USED,
        code: API_ERROR_CODES.FREE_PLAN_ALLOWANCE_USED,
      },
    );
    expectThrownAppError(
      () =>
        throwCreatePlanResultError({
          status: 'free_generation_in_progress',
          reason: 'in progress',
        }),
      {
        status: API_ERROR_HTTP_STATUS.FREE_PLAN_GENERATION_IN_PROGRESS,
        code: API_ERROR_CODES.FREE_PLAN_GENERATION_IN_PROGRESS,
      },
    );
  });
});
