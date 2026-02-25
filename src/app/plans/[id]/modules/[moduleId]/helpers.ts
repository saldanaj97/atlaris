/**
 * Helper functions for module access operations.
 *
 * These functions work with the discriminated union types defined in types.ts
 * to create results, check success status, and safely extract error information.
 */

import type {
  ModuleAccessError,
  ModuleAccessErrorCode,
  ModuleAccessResult,
} from '@/app/plans/[id]/modules/[moduleId]/types';
import type { ModuleDetail } from '@/lib/db/queries/types/modules.types';

/**
 * Helper to create success result
 */
export function moduleSuccess(data: ModuleDetail): ModuleAccessResult {
  return { success: true, data };
}

/**
 * Helper to create error result
 */
export function moduleError(
  code: ModuleAccessErrorCode,
  message: string
): ModuleAccessResult {
  return { success: false, error: { code, message } };
}

/**
 * Type guard to check if module access result is successful
 */
export function isModuleSuccess(
  result: ModuleAccessResult
): result is { success: true; data: ModuleDetail } {
  return result.success === true;
}

/**
 * Helper to safely extract error from module access result
 * Only call this after checking !isModuleSuccess(result)
 */
export function getModuleError(result: ModuleAccessResult): ModuleAccessError {
  if (result.success === false) {
    return result.error;
  }
  throw new Error('Cannot get error from successful result');
}
