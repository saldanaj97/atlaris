/**
 * Types for plan access operations with explicit error handling.
 *
 * These types enable discriminated union pattern for handling different
 * access scenarios: success, authentication failure, authorization failure,
 * and not-found cases.
 */

export type {
  PlanDetailsCardStats,
  PlanOverviewStats,
} from '@/features/plans/task-progress/client';

import type {
  AccessError,
  AccessErrorCode,
  AccessResult,
} from '@/app/(app)/plans/access-result';
import type { ClientPlanDetail } from '@/shared/types/client.types';

export type PlanAccessErrorCode = AccessErrorCode;
export type PlanAccessError = AccessError;
export type PlanAccessResult = AccessResult<ClientPlanDetail>;
