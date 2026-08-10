import {
  CHECKOUT_BASELINE_QUERY_PARAM,
  CHECKOUT_SYNC_TIMEOUT_MS,
  buildCheckoutBillingSignature,
  buildCheckoutReturnRedirectUrl,
  hasCheckoutBillingCaughtUp,
  isCheckoutReturnQueryValue,
  shouldContinueCheckoutSync,
} from '@/features/billing/checkout-return';
import { describe, expect, it } from 'vitest';

describe('checkout-return helpers', () => {
  it('builds the settings redirect with an explicit checkout marker', () => {
    const baselineSignature = 'free|active||0';

    expect(buildCheckoutReturnRedirectUrl('/settings', baselineSignature)).toBe(
      `/settings?checkout=1&${CHECKOUT_BASELINE_QUERY_PARAM}=free%7Cactive%7C%7C0#billing`,
    );
  });

  it('recognizes only the explicit checkout return value', () => {
    expect(isCheckoutReturnQueryValue('1')).toBe(true);
    expect(isCheckoutReturnQueryValue('true')).toBe(false);
    expect(isCheckoutReturnQueryValue(null)).toBe(false);
  });

  it('detects projection catch-up when the billing signature changes', () => {
    const baselineSignature = buildCheckoutBillingSignature({
      tier: 'free',
      status: 'active',
      periodEnd: null,
      cancelAtPeriodEnd: false,
    });
    const currentSignature = buildCheckoutBillingSignature({
      tier: 'pro',
      status: 'active',
      periodEnd: '2026-08-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
    });

    expect(
      hasCheckoutBillingCaughtUp({
        baselineSignature,
        currentSignature,
      }),
    ).toBe(true);

    expect(
      hasCheckoutBillingCaughtUp({
        baselineSignature,
        currentSignature: baselineSignature,
      }),
    ).toBe(false);
  });

  it('stops polling after catch-up or the bounded timeout', () => {
    expect(
      shouldContinueCheckoutSync({
        elapsedMs: 0,
        caughtUp: true,
      }),
    ).toBe(false);

    expect(
      shouldContinueCheckoutSync({
        elapsedMs: CHECKOUT_SYNC_TIMEOUT_MS - 1,
        caughtUp: false,
      }),
    ).toBe(true);

    expect(
      shouldContinueCheckoutSync({
        elapsedMs: CHECKOUT_SYNC_TIMEOUT_MS,
        caughtUp: false,
      }),
    ).toBe(false);
  });
});
