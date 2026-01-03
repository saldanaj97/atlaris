/**
 * Unit tests for plan access result types and helper functions.
 *
 * These tests verify the discriminated union pattern for handling
 * plan access scenarios (success, auth failure, not found, etc.)
 */

import { describe, expect, it } from 'vitest';

import type {
  PlanAccessErrorCode,
  PlanAccessResult,
  ScheduleAccessResult,
} from '@/app/plans/[id]/types';
import {
  planError,
  planSuccess,
  scheduleError,
  scheduleSuccess,
} from '@/app/plans/[id]/helpers';
import type {
  LearningPlanDetail,
  LearningPlanWithModules,
} from '@/lib/types/db';
import type { ScheduleJson } from '@/lib/scheduling/types';

const BASE_DATE = new Date('2025-01-01T00:00:00.000Z');

// Builder function for creating mock plan (matches schema exactly)
function buildPlan(
  overrides: Partial<LearningPlanWithModules> = {}
): LearningPlanWithModules {
  return {
    id: 'plan-123',
    userId: 'user-456',
    topic: 'TypeScript Fundamentals',
    skillLevel: 'beginner',
    weeklyHours: 10,
    learningStyle: 'mixed',
    startDate: null,
    deadlineDate: null,
    visibility: 'private',
    origin: 'ai',
    generationStatus: 'ready',
    isQuotaEligible: true,
    finalizedAt: BASE_DATE,
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    modules: [],
    ...overrides,
  } satisfies LearningPlanWithModules;
}

// Builder function for creating mock plan detail
function buildDetail(
  overrides: Partial<LearningPlanDetail> = {}
): LearningPlanDetail {
  return {
    plan: buildPlan(),
    totalTasks: 0,
    completedTasks: 0,
    latestAttempt: null,
    attemptsCount: 0,
    latestJobStatus: null,
    latestJobError: null,
    ...overrides,
  } satisfies LearningPlanDetail;
}

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
      const mockPlanData = buildDetail();
      const result = planSuccess(mockPlanData);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('data');
      if (result.success) {
        expect(result.data).toBe(mockPlanData);
        expect(result.data.plan.id).toBe('plan-123');
        expect(result.data.plan.topic).toBe('TypeScript Fundamentals');
      }
    });

    it('should allow type narrowing via success discriminant', () => {
      const mockPlanData = buildDetail();
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
      const mockPlanData = buildDetail({
        totalTasks: 10,
        completedTasks: 5,
        attemptsCount: 3,
        latestJobStatus: 'completed',
      });
      const result = planSuccess(mockPlanData);

      if (result.success) {
        expect(result.data.totalTasks).toBe(10);
        expect(result.data.completedTasks).toBe(5);
        expect(result.data.attemptsCount).toBe(3);
        expect(result.data.latestJobStatus).toBe('completed');
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

  describe('Error Code Semantics', () => {
    it('UNAUTHORIZED should indicate authentication required', () => {
      const result = planError(
        'UNAUTHORIZED',
        'You must be signed in to view this plan.'
      );

      if (!result.success) {
        // UNAUTHORIZED (401) - redirect to sign-in
        expect(result.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('NOT_FOUND should indicate plan does not exist', () => {
      const result = planError(
        'NOT_FOUND',
        'This plan does not exist or you do not have access to it.'
      );

      if (!result.success) {
        // NOT_FOUND (404) - show not found message
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('FORBIDDEN should indicate access denied', () => {
      const result = planError(
        'FORBIDDEN',
        'You do not have permission to access this plan.'
      );

      if (!result.success) {
        // FORBIDDEN (403) - show access denied message
        expect(result.error.code).toBe('FORBIDDEN');
      }
    });

    it('INTERNAL_ERROR should indicate unexpected failure', () => {
      const result = planError(
        'INTERNAL_ERROR',
        'An unexpected error occurred.'
      );

      if (!result.success) {
        // INTERNAL_ERROR (500) - show generic error
        expect(result.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('Result Type Exhaustiveness', () => {
    it('should handle all error codes in a switch statement', () => {
      const errorCodes: PlanAccessErrorCode[] = [
        'UNAUTHORIZED',
        'NOT_FOUND',
        'FORBIDDEN',
        'INTERNAL_ERROR',
      ];

      for (const code of errorCodes) {
        const result = planError(code, 'Test message');

        if (!result.success) {
          // This pattern demonstrates how consumers should handle errors
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
              // TypeScript will error if we miss a case
              const _exhaustiveCheck: never = result.error.code;
              throw new Error(
                `Unhandled error code: ${String(_exhaustiveCheck)}`
              );
            }
          }
          expect(httpStatus).toBeGreaterThan(0);
        }
      }
    });

    it('should map error codes to correct HTTP statuses', () => {
      const errorCodeToStatus: Record<PlanAccessErrorCode, number> = {
        UNAUTHORIZED: 401,
        NOT_FOUND: 404,
        FORBIDDEN: 403,
        INTERNAL_ERROR: 500,
      };

      for (const [code, expectedStatus] of Object.entries(errorCodeToStatus)) {
        const result = planError(code as PlanAccessErrorCode, 'Test');
        if (!result.success) {
          expect(errorCodeToStatus[result.error.code]).toBe(expectedStatus);
        }
      }
    });
  });

  describe('Discriminated Union Pattern', () => {
    it('success and error results should be mutually exclusive', () => {
      const successResult = planSuccess(buildDetail());
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
        planSuccess(buildDetail()),
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
