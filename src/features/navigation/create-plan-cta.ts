import { ROUTES } from '@/features/navigation/routes';

export type CreatePlanCta = {
  href: typeof ROUTES.PLANS.NEW | typeof ROUTES.PRICING;
  label: string;
};

/**
 * Resolves the shared create-plan chrome for authenticated entitlement
 * (`true` / `false` / unknown) and the intentional signed-out `/plans/new` path.
 */
export function resolveCreatePlanCta({
  isAuthenticated = true,
  canCreatePlan,
  createLabel,
}: {
  isAuthenticated?: boolean;
  canCreatePlan?: boolean;
  createLabel: string;
}): CreatePlanCta | null {
  if (isAuthenticated && canCreatePlan === undefined) {
    return null;
  }

  if (isAuthenticated && canCreatePlan === false) {
    return { href: ROUTES.PRICING, label: 'Upgrade' };
  }

  return { href: ROUTES.PLANS.NEW, label: createLabel };
}
