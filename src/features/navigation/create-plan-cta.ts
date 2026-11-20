import { ROUTES } from '@/features/navigation/routes';

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

export type MarketingCreatePlanCta = { href: string; label: string };

export function resolveMarketingCreatePlanCta({
  isAuthenticated,
  canCreatePlan,
}: {
  isAuthenticated: boolean;
  canCreatePlan?: boolean;
}): MarketingCreatePlanCta {
  if (!isAuthenticated) {
    return {
      href: `${ROUTES.AUTH.SIGN_UP}?redirect_url=${encodeURIComponent(ROUTES.PLANS.NEW)}`,
      label: CREATE_PLAN_LABEL,
    };
  }

  if (canCreatePlan === false) {
    return { href: ROUTES.PRICING, label: 'Choose a plan' };
  }

  return { href: ROUTES.PLANS.NEW, label: CREATE_PLAN_LABEL };
}

export function resolveMarketingPrimaryCta({
  isAuthenticated,
  pathname,
}: {
  isAuthenticated: boolean;
  pathname: string;
}): { href: string; label: string } {
  if (isAuthenticated) {
    return { href: ROUTES.DASHBOARD, label: 'Dashboard' };
  }

  if (isAuthPath(pathname)) {
    return { href: ROUTES.AUTH.SIGN_UP, label: 'Sign up' };
  }

  return { href: ROUTES.PLANS.NEW, label: CREATE_PLAN_LABEL };
}

export function isAuthPath(pathname: string): boolean {
  return [ROUTES.AUTH.SIGN_IN, ROUTES.AUTH.SIGN_UP].some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
