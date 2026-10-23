/**
 * Types for plan access operations with explicit error handling.
 *
 * These types enable discriminated union pattern for handling different
 * access scenarios: success, authentication failure, authorization failure,
 * and not-found cases.
 */

export type { PlanOverviewStats } from '@/features/plans/task-progress/client';

import type {
  AccessError,
  AccessErrorCode,
  AccessResult,
} from '@/app/(app)/plans/access-result';
import type { ClientPlanDetail } from '@/shared/types/client.types';

export type PlanAccessErrorCode = AccessErrorCode;
export type PlanAccessError = AccessError;
export type PlanAccessResult = AccessResult<ClientPlanDetail>;

/** Whether the plan page offers regeneration, and whether one is running. */
export type PlanRegenerationState = {
  readonly canRegenerate: boolean;
  readonly isRegenerating: boolean;
};

/** Content a paid plan shows that the free router generated (DEV-175). */
export type FreeRouterNotice = {
  readonly outline: boolean;
  readonly lessonModuleCount: number;
};
