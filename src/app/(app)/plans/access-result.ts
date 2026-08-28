import type { FreeAccessPlanCandidate } from '@/features/plans/policy/entitlement';

import { AppError } from '@/lib/api/errors';
import { API_ERROR_CODES } from '@/shared/constants/api-error-codes';

export type AccessErrorCode =
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'
  | 'PLAN_ENTITLEMENT_REQUIRED'
  | 'FREE_PLAN_SELECTION_REQUIRED';

export type AccessError = {
  code: AccessErrorCode;
  message: string;
  candidates?: readonly FreeAccessPlanCandidate[];
};

export type AccessResult<T> =
  | { success: true; data: T }
  | { success: false; error: AccessError };

export function accessSuccess<T>(data: T): AccessResult<T> {
  return { success: true, data };
}

export function accessError(
  code: AccessErrorCode,
  message: string,
  candidates?: readonly FreeAccessPlanCandidate[],
): AccessResult<never> {
  return {
    success: false,
    error: candidates ? { code, message, candidates } : { code, message },
  };
}

export function isAccessSuccess<T>(
  result: AccessResult<T>,
): result is { success: true; data: T } {
  return result.success === true;
}

export function getAccessError<T>(result: AccessResult<T>): AccessError {
  if (result.success === false) {
    return result.error;
  }
  throw new Error('Cannot get error from successful result');
}

function readSelectionCandidates(
  details: unknown,
): readonly FreeAccessPlanCandidate[] | undefined {
  if (details == null || typeof details !== 'object') {
    return undefined;
  }
  const candidates = (details as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) {
    return undefined;
  }
  return candidates as FreeAccessPlanCandidate[];
}

export function accessErrorFromAppError(error: unknown): AccessError | null {
  if (!(error instanceof AppError)) {
    return null;
  }
  const code = error.code();
  switch (code) {
    case API_ERROR_CODES.PLAN_ENTITLEMENT_REQUIRED:
      return {
        code: 'PLAN_ENTITLEMENT_REQUIRED',
        message: error.message,
      };
    case API_ERROR_CODES.FREE_PLAN_SELECTION_REQUIRED:
      return {
        code: 'FREE_PLAN_SELECTION_REQUIRED',
        message: error.message,
        candidates: readSelectionCandidates(error.details()),
      };
    default:
      return null;
  }
}
