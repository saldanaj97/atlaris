import type { FreeAccessPlanCandidate } from '@/features/plans/policy/entitlement';

import { ROUTES } from '@/features/navigation/routes';
import { AppError } from '@/lib/api/errors';
import {
  API_ERROR_CODES,
  API_ERROR_HTTP_STATUS,
} from '@/shared/constants/api-error-codes';

export function throwPlanEntitlementRequired(): never {
  throw new AppError('Upgrade to access this plan.', {
    status: API_ERROR_HTTP_STATUS.PLAN_ENTITLEMENT_REQUIRED,
    code: API_ERROR_CODES.PLAN_ENTITLEMENT_REQUIRED,
    details: { upgradeUrl: ROUTES.PRICING },
  });
}

export function throwFreePlanSelectionRequired(
  candidates: readonly FreeAccessPlanCandidate[],
): never {
  throw new AppError('Select which plan to keep on the Free plan.', {
    status: API_ERROR_HTTP_STATUS.FREE_PLAN_SELECTION_REQUIRED,
    code: API_ERROR_CODES.FREE_PLAN_SELECTION_REQUIRED,
    classification: 'conflict',
    details: { candidates },
  });
}
