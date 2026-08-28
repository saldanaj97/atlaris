import {
  API_ERROR_CODES,
  API_ERROR_HTTP_STATUS,
} from '@/shared/constants/api-error-codes';
import { describe, expect, it } from 'vitest';

describe('API_ERROR_CODES', () => {
  it('maps entitlement codes to the documented HTTP statuses', () => {
    expect(
      API_ERROR_HTTP_STATUS[API_ERROR_CODES.FREE_PLAN_ALLOWANCE_USED],
    ).toBe(403);
    expect(
      API_ERROR_HTTP_STATUS[API_ERROR_CODES.FREE_PLAN_GENERATION_IN_PROGRESS],
    ).toBe(409);
    expect(
      API_ERROR_HTTP_STATUS[API_ERROR_CODES.FREE_PLAN_SELECTION_REQUIRED],
    ).toBe(409);
    expect(
      API_ERROR_HTTP_STATUS[API_ERROR_CODES.PLAN_ENTITLEMENT_REQUIRED],
    ).toBe(403);
    expect(
      API_ERROR_HTTP_STATUS[API_ERROR_CODES.PLAN_REGENERATION_NOT_INCLUDED],
    ).toBe(403);
    expect(
      API_ERROR_HTTP_STATUS[API_ERROR_CODES.REGENERATION_QUOTA_EXCEEDED],
    ).toBe(429);
    expect(
      API_ERROR_HTTP_STATUS[API_ERROR_CODES.PLAN_DURATION_LIMIT_EXCEEDED],
    ).toBe(403);
    expect(
      API_ERROR_HTTP_STATUS[API_ERROR_CODES.MODEL_NOT_AVAILABLE_FOR_OPERATION],
    ).toBe(403);
  });

  it('does not define MODULE_ENTITLEMENT_REQUIRED', () => {
    expect(API_ERROR_CODES).not.toHaveProperty('MODULE_ENTITLEMENT_REQUIRED');
  });
});
