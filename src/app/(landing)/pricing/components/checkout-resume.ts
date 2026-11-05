import type { BillingPeriod } from './pricing-card-model';

// A signed-out checkout click returns to /pricing with what to resume.
export const CHECKOUT_PLAN_PARAM = 'checkoutPlan';
export const CHECKOUT_PLAN_SLUG_PARAM = 'checkoutPlanSlug';
export const CHECKOUT_PERIOD_PARAM = 'checkoutPeriod';
/** Set when the visitor ticked the renewal checkbox before signing in, so the resumed checkout stays enabled. */
export const CHECKOUT_CONSENT_PARAM = 'checkoutConsent';

export function checkoutSignInRedirect(
  planId: string,
  planSlug: string,
  period: BillingPeriod,
  agreed: boolean,
): string {
  const params = new URLSearchParams({
    [CHECKOUT_PLAN_PARAM]: planId,
    [CHECKOUT_PLAN_SLUG_PARAM]: planSlug,
    [CHECKOUT_PERIOD_PARAM]: period,
  });
  if (agreed) params.set(CHECKOUT_CONSENT_PARAM, '1');
  return `/pricing?${params.toString()}`;
}

export function clearCheckoutParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(CHECKOUT_PLAN_PARAM);
  url.searchParams.delete(CHECKOUT_PLAN_SLUG_PARAM);
  url.searchParams.delete(CHECKOUT_PERIOD_PARAM);
  url.searchParams.delete(CHECKOUT_CONSENT_PARAM);
  window.history.replaceState(window.history.state, '', url);
}
