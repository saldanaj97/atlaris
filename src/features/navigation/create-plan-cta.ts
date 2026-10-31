import { ROUTES } from '@/features/navigation/routes';

/** The one label for the create-plan action, in the app chrome and on the landing page. */
export const CREATE_PLAN_LABEL = 'Create a plan';

export type CreatePlanCta = {
  href: typeof ROUTES.PLANS.NEW | typeof ROUTES.PRICING;
  label: string;
};

/**
 * Resolves the app chrome's create-plan action from authenticated entitlement
 * (`true` / `false` / unknown). Blocked users always get Upgrade; the create
 * action is hidden on the plan form itself. Signed-out visitors get the
 * marketing CTA instead.
 */
export function resolveCreatePlanCta({
  canCreatePlan,
  pathname,
}: {
  canCreatePlan?: boolean;
  pathname?: string;
}): CreatePlanCta | null {
  if (canCreatePlan === undefined) {
    return null;
  }

  if (canCreatePlan === false) {
    return { href: ROUTES.PRICING, label: 'Upgrade' };
  }

  if (pathname === ROUTES.PLANS.NEW) {
    return null;
  }

  return { href: ROUTES.PLANS.NEW, label: CREATE_PLAN_LABEL };
}
