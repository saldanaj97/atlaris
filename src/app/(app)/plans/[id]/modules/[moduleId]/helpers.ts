/**
 * Helper functions for module access operations.
 *
 * These functions work with the discriminated union types defined in types.ts
 * to create results, check success status, and safely extract error information.
 */

import {
  accessError,
  accessSuccess,
  getAccessError,
  isAccessSuccess,
} from '@/app/(app)/plans/access-result';
import type { ModuleDetailReadModel } from '@/features/plans/read-projection/types';
import type {
  ModuleAccessError,
  ModuleAccessErrorCode,
  ModuleAccessResult,
} from './types';

export function moduleSuccess(data: ModuleDetailReadModel): ModuleAccessResult {
  return accessSuccess(data);
}

export function moduleError(
  code: ModuleAccessErrorCode,
  message: string,
): ModuleAccessResult {
  return accessError(code, message);
}

export function isModuleSuccess(
  result: ModuleAccessResult,
): result is { success: true; data: ModuleDetailReadModel } {
  return isAccessSuccess(result);
}

export function getModuleError(result: ModuleAccessResult): ModuleAccessError {
  return getAccessError(result);
}
