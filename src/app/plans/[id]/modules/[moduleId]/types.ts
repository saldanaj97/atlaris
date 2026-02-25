/**
 * Types for module access operations with explicit error handling.
 *
 * These types enable discriminated union pattern for handling different
 * access scenarios: success, authentication failure, authorization failure,
 * and not-found cases.
 */

import type { ModuleDetail } from '@/lib/db/queries/types/modules.types';

/**
 * Error codes for module access failures.
 * Each code maps to a specific HTTP status and user-facing behavior.
 */
export type ModuleAccessErrorCode =
  /** User is not authenticated (401) - redirect to sign-in */
  | 'UNAUTHORIZED'
  /** Module does not exist (404) - show not found message */
  | 'NOT_FOUND'
  /** User cannot access this module (403) - show access denied message */
  | 'FORBIDDEN'
  /** Unexpected error during fetch (500) - show generic error */
  | 'INTERNAL_ERROR';

/**
 * Structured error for module access failures.
 */
export type ModuleAccessError = {
  code: ModuleAccessErrorCode;
  message: string;
};

/**
 * Result type for module fetch operations.
 * Uses discriminated union for exhaustive error handling.
 */
export type ModuleAccessResult =
  | { success: true; data: ModuleDetail }
  | { success: false; error: ModuleAccessError };
