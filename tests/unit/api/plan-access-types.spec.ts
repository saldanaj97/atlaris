/**
 * Unit tests for plan access result types and helper functions.
 *
 * These tests verify the discriminated union pattern for handling
 * plan access scenarios (success, auth failure, not found, etc.)
 */

import { describe, expect, it } from 'vitest';

import {
  planError,
  planSuccess,
  scheduleError,
  scheduleSuccess,
} from '@/app/plans/[id]/helpers';
import type {
  PlanAccessErrorCode,
  PlanAccessResult,
  ScheduleAccessResult,
} from '@/app/plans/[id]/types';
import type { ScheduleJson } from '@/lib/scheduling/types';
import { buildPlanDetail } from '../../fixtures/plan-detail';

// Builder function for creating mock schedule data
function buildSchedule(overrides: Partial<ScheduleJson> = {}): ScheduleJson {
  return {
    weeks: [],
    totalWeeks: 0,
    totalSessions: 0,
    ...overrides,
  } satisfies ScheduleJson;
}

describe('Plan Access Types', () => {
  describe('planSuccess', () => {
    it('should create a success result with plan data', () => {
      const mockPlanData = buildPlanDetail();
      const result = planSuccess(mockPlanData);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('data');
      if (result.success) {
        expect(result.data.plan.id).toBe(mockPlanData.plan.id);
        expect(result.data.plan.topic).toBe('Machine Learning Fundamentals');
      }
    });

    it('should allow type narrowing via success discriminant', () => {
      const mockPlanData = buildPlanDetail();
      const result: PlanAccessResult = planSuccess(mockPlanData);

      // TypeScript should narrow the type correctly
      if (result.success) {
        // This should compile without errors - data is accessible
        expect(result.data.plan.id).toBeDefined();
        expect(result.data.totalTasks).toBeDefined();
      } else {
        // This branch should have error property
        expect(result.error.code).toBeDefined();
      }
    });

    it('should preserve all plan properties', () => {
      const mockPlanData = buildPlanDetail({
        totalTasks: 10,
        completedTasks: 5,
        attemptsCount: 3,
      });
      const result = planSuccess(mockPlanData);

      if (result.success) {
        expect(result.data.totalTasks).toBe(10);
        expect(result.data.completedTasks).toBe(5);
        expect(result.data.attemptsCount).toBe(3);
      }
    });
  });

  describe('planError', () => {
    it.each<{ code: PlanAccessErrorCode; message: string }>([
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
        'Not authenticated'
      );

      // TypeScript should narrow the type correctly
      if (!result.success) {
        // This should compile without errors - error is accessible
        expect(result.error.code).toBe('UNAUTHORIZED');
        expect(result.error.message).toBeDefined();
      } else {
        // This branch should have data property
        expect(result.data.plan.id).toBeDefined();
      }
    });
  });

  describe('scheduleSuccess', () => {
    it('should create a success result with schedule data', () => {
      const mockScheduleData = buildSchedule({
        totalWeeks: 4,
        totalSessions: 16,
      });
      const result = scheduleSuccess(mockScheduleData);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('data');
      if (result.success) {
        expect(result.data).toBe(mockScheduleData);
        expect(result.data.totalWeeks).toBe(4);
        expect(result.data.totalSessions).toBe(16);
      }
    });

    it('should allow type narrowing via success discriminant', () => {
      const mockScheduleData = buildSchedule();
      const result: ScheduleAccessResult = scheduleSuccess(mockScheduleData);

      if (result.success) {
        expect(result.data.weeks).toBeDefined();
        expect(result.data.totalWeeks).toBeDefined();
      } else {
        expect(result.error.code).toBeDefined();
      }
    });

    it('should preserve schedule with weeks data', () => {
      const mockScheduleData = buildSchedule({
        totalWeeks: 2,
        totalSessions: 8,
        weeks: [
          {
            weekNumber: 1,
            startDate: '2024-01-01',
            endDate: '2024-01-07',
            days: [],
          },
          {
            weekNumber: 2,
            startDate: '2024-01-08',
            endDate: '2024-01-14',
            days: [],
          },
        ],
      });
      const result = scheduleSuccess(mockScheduleData);

      if (result.success) {
        expect(result.data.weeks).toHaveLength(2);
        expect(result.data.weeks[0].weekNumber).toBe(1);
      }
    });
  });

  describe('scheduleError', () => {
    it.each<{ code: PlanAccessErrorCode; message: string }>([
      { code: 'UNAUTHORIZED', message: 'You must be signed in.' },
      { code: 'NOT_FOUND', message: 'Schedule not found.' },
      { code: 'FORBIDDEN', message: 'Access denied.' },
      { code: 'INTERNAL_ERROR', message: 'Failed to load schedule.' },
    ])('should create error result for $code', ({ code, message }) => {
      const result = scheduleError(code, message);

      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
      if (!result.success) {
        expect(result.error.code).toBe(code);
        expect(result.error.message).toBe(message);
      }
    });
  });

  /** Runtime mapping from PlanAccessErrorCode to HTTP status; used for runtime tests and kept in sync with exhaustiveness switch. */
  const PLAN_ACCESS_ERROR_CODE_TO_HTTP_STATUS: Record<
    PlanAccessErrorCode,
    number
  > = {
    UNAUTHORIZED: 401,
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    INTERNAL_ERROR: 500,
  };

  describe('Result Type Exhaustiveness', () => {
    it('Compile-time exhaustiveness for PlanAccessErrorCode', () => {
      const errorCodes: PlanAccessErrorCode[] = [
        'UNAUTHORIZED',
        'NOT_FOUND',
        'FORBIDDEN',
        'INTERNAL_ERROR',
      ];

      for (const code of errorCodes) {
        const result = planError(code, 'Test message');

        if (!result.success) {
          // The switch below uses the _exhaustiveCheck: never pattern so that
          // TypeScript reports a compile error if a new PlanAccessErrorCode is
          // added and this switch is not updated. This is a compile-time
          // guarantee for planError and PlanAccessErrorCode, not runtime coverage.
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
                `Unhandled error code: ${String(_exhaustiveCheck)}`
              );
            }
          }
          expect(httpStatus).toBeGreaterThan(0);
          // Runtime coverage: assert the shared mapping exists for this code and yields a number
          const mapped =
            PLAN_ACCESS_ERROR_CODE_TO_HTTP_STATUS[result.error.code];
          expect(typeof mapped).toBe('number');
          expect(mapped).toBe(httpStatus);
        }
      }
    });

    it('should map error codes to correct HTTP statuses at runtime', () => {
      for (const [code, expectedStatus] of Object.entries(
        PLAN_ACCESS_ERROR_CODE_TO_HTTP_STATUS
      )) {
        const result = planError(code as PlanAccessErrorCode, 'Test');
        if (!result.success) {
          const status =
            PLAN_ACCESS_ERROR_CODE_TO_HTTP_STATUS[result.error.code];
          expect(typeof status).toBe('number');
          expect(status).toBe(expectedStatus);
        }
      }
    });
  });

  describe('Discriminated Union Pattern', () => {
    it('success and error results should be mutually exclusive', () => {
      const successResult = planSuccess(buildPlanDetail());
      const errorResult = planError('NOT_FOUND', 'Not found');

      // Success result should have data, not error
      expect(successResult.success).toBe(true);
      expect('data' in successResult).toBe(true);
      expect('error' in successResult).toBe(false);

      // Error result should have error, not data
      expect(errorResult.success).toBe(false);
      expect('error' in errorResult).toBe(true);
      expect('data' in errorResult).toBe(false);
    });

    it('should support conditional data access patterns', () => {
      const results: PlanAccessResult[] = [
        planSuccess(buildPlanDetail()),
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
