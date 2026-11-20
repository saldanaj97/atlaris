/**
 * Unit tests for plan access result types and helper functions.
 *
 * These tests verify the discriminated union pattern for handling
 * plan access scenarios (success, auth failure, not found, etc.)
 */

import type { ClientPlanDetail } from '@/shared/types/client.types';

import { planError, planSuccess } from '@/app/(app)/plans/[id]/helpers';
import {
  accessError,
  accessErrorFromAppError,
  accessSuccess,
  type AccessErrorCode,
} from '@/app/(app)/plans/access-result';
import { toClientPlanDetail } from '@/features/plans/read-projection/detail-dto';
import { AppError } from '@/lib/api/errors';
import {
  API_ERROR_CODES,
  API_ERROR_HTTP_STATUS,
} from '@/shared/constants/api-error-codes';
import { buildPlanDetail } from '@tests/fixtures/plan-detail';
import { describe, expect, it } from 'vitest';

function buildClientPlanDetail(
  overrides: Parameters<typeof buildPlanDetail>[0] = {},
): ClientPlanDetail {
  const detail = buildPlanDetail(overrides);
  const clientDetail = toClientPlanDetail(detail);

  if (!clientDetail) {
    throw new Error(
      `Expected client plan detail to be defined for overrides: ${JSON.stringify(overrides)}`,
    );
  }

  return clientDetail;
}

describe('Plan Access Types', () => {
  describe('accessSuccess', () => {
    it('should create a success result with arbitrary data', () => {
      const result = accessSuccess({ id: 'plan-1' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ id: 'plan-1' });
      }
    });
  });

  describe('accessError', () => {
    it.each<{ code: AccessErrorCode; message: string }>([
      { code: 'UNAUTHORIZED', message: 'You must be signed in.' },
      { code: 'NOT_FOUND', message: 'Plan does not exist.' },
      { code: 'FORBIDDEN', message: 'You do not have access.' },
      { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      {
        code: 'PLAN_ENTITLEMENT_REQUIRED',
        message: 'Upgrade to access this plan.',
      },
      {
        code: 'FREE_PLAN_SELECTION_REQUIRED',
        message: 'Select which plan to keep.',
      },
    ])('should create error result for $code', ({ code, message }) => {
      const result = accessError(code, message);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(code);
        expect(result.error.message).toBe(message);
      }
    });
  });

  describe('planSuccess', () => {
    it('should create a success result with plan data', () => {
      const mockPlanData = buildClientPlanDetail();
      const result = planSuccess(mockPlanData);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('data');
      if (result.success) {
        expect(result.data.id).toBe(mockPlanData.id);
        expect(result.data.topic).toBe('Machine Learning Fundamentals');
      }
    });
  });

  describe('planError', () => {
    it.each<{ code: AccessErrorCode; message: string }>([
      { code: 'UNAUTHORIZED', message: 'You must be signed in.' },
      { code: 'NOT_FOUND', message: 'Plan does not exist.' },
      { code: 'FORBIDDEN', message: 'You do not have access.' },
      { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      {
        code: 'PLAN_ENTITLEMENT_REQUIRED',
        message: 'Upgrade to access this plan.',
      },
      {
        code: 'FREE_PLAN_SELECTION_REQUIRED',
        message: 'Select which plan to keep.',
      },
    ])('should create error result for $code', ({ code, message }) => {
      const result = planError(code, message);

      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
      if (!result.success) {
        expect(result.error.code).toBe(code);
        expect(result.error.message).toBe(message);
      }
    });

    it('maps entitlement AppErrors including selection candidates', () => {
      const entitlement = accessErrorFromAppError(
        new AppError('Upgrade to access this plan.', {
          status: API_ERROR_HTTP_STATUS.PLAN_ENTITLEMENT_REQUIRED,
          code: API_ERROR_CODES.PLAN_ENTITLEMENT_REQUIRED,
        }),
      );
      expect(entitlement).toEqual({
        code: 'PLAN_ENTITLEMENT_REQUIRED',
        message: 'Upgrade to access this plan.',
      });

      const selection = accessErrorFromAppError(
        new AppError('Select which plan to keep on the Free plan.', {
          status: API_ERROR_HTTP_STATUS.FREE_PLAN_SELECTION_REQUIRED,
          code: API_ERROR_CODES.FREE_PLAN_SELECTION_REQUIRED,
          details: {
            candidates: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                topic: 'Keep me',
                createdAt: '2026-01-01T00:00:00.000Z',
                generationStatus: 'ready',
              },
            ],
          },
        }),
      );
      expect(selection?.code).toBe('FREE_PLAN_SELECTION_REQUIRED');
      expect(selection?.candidates).toHaveLength(1);
      expect(accessErrorFromAppError(new Error('nope'))).toBeNull();
    });
  });
});
