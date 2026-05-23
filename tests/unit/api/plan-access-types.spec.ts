/**
 * Unit tests for plan access result types and helper functions.
 *
 * These tests verify the discriminated union pattern for handling
 * plan access scenarios (success, auth failure, not found, etc.)
 */

import { buildPlanDetail } from '@tests/fixtures/plan-detail';
import { describe, expect, it } from 'vitest';
import {
  accessError,
  accessSuccess,
  type AccessErrorCode,
} from '@/app/(app)/plans/access-result';
import { planError, planSuccess } from '@/app/(app)/plans/[id]/helpers';
import type { PlanAccessResult } from '@/app/(app)/plans/[id]/types';
import { toClientPlanDetail } from '@/features/plans/read-projection/detail-dto';
import type { ClientPlanDetail } from '@/shared/types/client.types';

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

    it('should allow type narrowing via success discriminant', () => {
      const mockPlanData = buildClientPlanDetail();
      const result: PlanAccessResult = planSuccess(mockPlanData);

      if (result.success) {
        expect(result.data.id).toBeDefined();
        expect(result.data.totalTasks).toBeDefined();
      } else {
        expect(result.error.code).toBeDefined();
      }
    });

    it('should preserve all plan properties', () => {
      const mockPlanData = buildClientPlanDetail({
        totalTasks: 10,
        completedTasks: 5,
        attemptsCount: 3,
      });
      const result = planSuccess(mockPlanData);

      if (result.success) {
        expect(result.data.totalTasks).toBe(10);
        expect(result.data.completedTasks).toBe(5);
        expect(result.data.status).toBe(mockPlanData.status);
      }
    });
  });

  describe('planError', () => {
    it.each<{ code: AccessErrorCode; message: string }>([
      { code: 'UNAUTHORIZED', message: 'You must be signed in.' },
      { code: 'NOT_FOUND', message: 'Plan does not exist.' },
      { code: 'FORBIDDEN', message: 'You do not have access.' },
      { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    ])('should create error result for $code', ({ code, message }) => {
      const result = planError(code, message);

      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
      if (!result.success) {
        expect(result.error.code).toBe(code);
        expect(result.error.message).toBe(message);
      }
    });

    it('should preserve the exact error message', () => {
      const customMessage = 'Custom error message with details';
      const result = planError('NOT_FOUND', customMessage);

      if (!result.success) {
        expect(result.error.message).toBe(customMessage);
      }
    });

    it('should allow type narrowing via success discriminant', () => {
      const result: PlanAccessResult = planError(
        'UNAUTHORIZED',
        'Not authenticated',
      );

      if (!result.success) {
        expect(result.error.code).toBe('UNAUTHORIZED');
        expect(result.error.message).toBeDefined();
      } else {
        expect(result.data.id).toBeDefined();
      }
    });
  });

  const ACCESS_ERROR_CODE_TO_HTTP_STATUS: Record<AccessErrorCode, number> = {
    UNAUTHORIZED: 401,
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    INTERNAL_ERROR: 500,
  };

  describe('Result Type Exhaustiveness', () => {
    it('Compile-time exhaustiveness for AccessErrorCode', () => {
      const errorCodes: AccessErrorCode[] = [
        'UNAUTHORIZED',
        'NOT_FOUND',
        'FORBIDDEN',
        'INTERNAL_ERROR',
      ];

      for (const code of errorCodes) {
        const result = planError(code, 'Test message');

        if (!result.success) {
          let httpStatus: number;
          switch (result.error.code) {
            case 'UNAUTHORIZED':
              httpStatus = 401;
              break;
            case 'NOT_FOUND':
              httpStatus = 404;
              break;
            case 'FORBIDDEN':
              httpStatus = 403;
              break;
            case 'INTERNAL_ERROR':
              httpStatus = 500;
              break;
            default: {
              const _exhaustiveCheck: never = result.error.code;
              throw new Error(
                `Unhandled error code: ${String(_exhaustiveCheck)}`,
              );
            }
          }
          expect(httpStatus).toBeGreaterThan(0);
          const mapped = ACCESS_ERROR_CODE_TO_HTTP_STATUS[result.error.code];
          expect(typeof mapped).toBe('number');
          expect(mapped).toBe(httpStatus);
        }
      }
    });

    it('should map error codes to correct HTTP statuses at runtime', () => {
      for (const [code, expectedStatus] of Object.entries(
        ACCESS_ERROR_CODE_TO_HTTP_STATUS,
      )) {
        const result = planError(code as AccessErrorCode, 'Test');
        if (!result.success) {
          const status = ACCESS_ERROR_CODE_TO_HTTP_STATUS[result.error.code];
          expect(typeof status).toBe('number');
          expect(status).toBe(expectedStatus);
        }
      }
    });
  });

  describe('Discriminated Union Pattern', () => {
    it('success and error results should be mutually exclusive', () => {
      const successResult = planSuccess(buildClientPlanDetail());
      const errorResult = planError('NOT_FOUND', 'Not found');

      expect(successResult.success).toBe(true);
      expect('data' in successResult).toBe(true);
      expect('error' in successResult).toBe(false);

      expect(errorResult.success).toBe(false);
      expect('error' in errorResult).toBe(true);
      expect('data' in errorResult).toBe(false);
    });

    it('should support conditional data access patterns', () => {
      const results: PlanAccessResult[] = [
        planSuccess(buildClientPlanDetail()),
        planError('UNAUTHORIZED', 'Not authenticated'),
        planError('NOT_FOUND', 'Not found'),
      ];

      const successCount = results.filter((r) => r.success).length;
      const errorCount = results.filter((r) => !r.success).length;

      expect(successCount).toBe(1);
      expect(errorCount).toBe(2);
    });
  });
});
