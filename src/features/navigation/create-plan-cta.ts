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

/**
 * The marketing header's one call to action. Signed-in visitors go to the
 * dashboard; on the auth pages a visitor is already mid sign-in, so the
 * action is Sign up rather than the plan form.
 */
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

/** Sign-in and sign-up pages, including Clerk's nested steps. */
export function isAuthPath(pathname: string): boolean {
  return [ROUTES.AUTH.SIGN_IN, ROUTES.AUTH.SIGN_UP].some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
