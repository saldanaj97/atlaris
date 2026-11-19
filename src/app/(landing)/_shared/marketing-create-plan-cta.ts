import {
  resolveMarketingCreatePlanCta,
  ROUTES,
  type MarketingCreatePlanCta,
} from '@/features/navigation';
import { canCreatePlanOnCurrentTier } from '@/features/plans/policy/entitlement';
import { requestBoundary } from '@/lib/api/request-boundary';
import { getShellAuthUserId } from '@/lib/auth/local-identity';
import { getSessionSafe } from '@/lib/auth/server';
import { logger } from '@/lib/logging/logger';
import { resolveViewerSiteGate } from '@/lib/proxy/middleware-policy';
import { resolveSiteGate } from '@/lib/proxy/site-gate';

const FALLBACK_CTA: MarketingCreatePlanCta = {
  href: ROUTES.PLANS.NEW,
  label: 'Create a plan',
};

/**
 * Where a marketing page's "Create a plan" buttons go for this visitor.
 * Renders them signed out behind a site gate, like the header does. If the
 * lookup fails the buttons keep the plan form link, which sends a visitor
 * without a subscription to pricing on its own.
 */
export async function getMarketingCreatePlanCta(): Promise<MarketingCreatePlanCta> {
  try {
    const [{ session }, siteGate] = await Promise.all([
      getSessionSafe(),
      resolveSiteGate(),
    ]);
    const authUserId = resolveViewerSiteGate(
      siteGate,
      Boolean(session?.user?.id),
    )
      ? undefined
      : getShellAuthUserId(session?.user?.id);
    if (!authUserId) {
      return resolveMarketingCreatePlanCta({ isAuthenticated: false });
    }

    const canCreatePlan = await requestBoundary
      .component(({ actor }) => canCreatePlanOnCurrentTier(actor))
      .catch(() => undefined);
    return resolveMarketingCreatePlanCta({
      isAuthenticated: true,
      canCreatePlan: canCreatePlan ?? undefined,
    });
  } catch (err) {
    logger.warn(
      { err, source: 'getMarketingCreatePlanCta' },
      'Create-plan CTA lookup failed; marketing buttons use the plan form link',
    );
    return FALLBACK_CTA;
  }
}
