/**
 * Types for module access operations with explicit error handling.
 *
 * These types enable discriminated union pattern for handling different
 * access scenarios: success, authentication failure, authorization failure,
 * and not-found cases.
 */

import type {
  AccessError,
  AccessErrorCode,
  AccessResult,
} from '@/app/(app)/plans/access-result';
import type { ModuleDetailReadModel } from '@/features/plans/read-projection/types';

export type ModuleAccessErrorCode = AccessErrorCode;
export type ModuleAccessError = AccessError;
export type ModuleAccessResult = AccessResult<ModuleDetailReadModel>;
