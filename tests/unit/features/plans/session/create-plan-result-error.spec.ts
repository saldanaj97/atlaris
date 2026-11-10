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
  it('maps a missing subscription to SUBSCRIPTION_REQUIRED', () => {
    expectThrownAppError(
      () =>
        throwCreatePlanResultError({
          status: 'subscription_required',
          reason: 'subscribe',
          upgradeUrl: '/pricing',
        }),
      {
        status: API_ERROR_HTTP_STATUS.SUBSCRIPTION_REQUIRED,
        code: API_ERROR_CODES.SUBSCRIPTION_REQUIRED,
      },
    );
  });

  it('maps duration denials to PLAN_DURATION_LIMIT_EXCEEDED', () => {
    expectThrownAppError(
      () =>
        throwCreatePlanResultError({
          status: 'duration_exceeded',
          reason: 'Starter tier limited to 8-week plans.',
          upgradeUrl: '/pricing',
        }),
      {
        status: API_ERROR_HTTP_STATUS.PLAN_DURATION_LIMIT_EXCEEDED,
        code: API_ERROR_CODES.PLAN_DURATION_LIMIT_EXCEEDED,
      },
    );
  });

  it('keeps plan-limit quota_rejected on QUOTA_EXCEEDED', () => {
    expectThrownAppError(
      () =>
        throwCreatePlanResultError({
          status: 'quota_rejected',
          reason: 'Plan limit reached for current subscription tier',
        }),
      {
        status: 403,
        code: 'QUOTA_EXCEEDED',
      },
    );
  });
});
