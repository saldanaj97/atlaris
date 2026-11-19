import type { FreeAccessPlanCandidate } from '@/features/plans/policy/entitlement';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { ROUTES } from '@/features/navigation/routes';
import { AppError } from '@/lib/api/errors';
import {
  API_ERROR_CODES,
  API_ERROR_HTTP_STATUS,
} from '@/shared/constants/api-error-codes';
import {
  evaluateGenerationAdmission,
  SUBSCRIPTION_REQUIRED_MESSAGE,
} from '@/shared/policy/generation-admission';

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

/**
 * Route-level gate for every request that starts AI generation. The reservation
 * paths re-check under the user lock; this answers early, before any rate-limit
 * or spend work.
 */
export function assertGenerationEntitled(actor: {
  readonly subscriptionTier: SubscriptionTier;
}): void {
  if (evaluateGenerationAdmission({ tier: actor.subscriptionTier }) === 'ok') {
    return;
  }
  throw new AppError(SUBSCRIPTION_REQUIRED_MESSAGE, {
    status: API_ERROR_HTTP_STATUS.SUBSCRIPTION_REQUIRED,
    code: API_ERROR_CODES.SUBSCRIPTION_REQUIRED,
    details: { upgradeUrl: ROUTES.PRICING },
  });
}
