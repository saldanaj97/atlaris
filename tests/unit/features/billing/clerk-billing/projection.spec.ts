import {
  clerkBillingSourceFromWebhook,
  projectClerkBillingSource,
  type ClerkBillingProjectionItem,
  type ClerkBillingProjectionSource,
  type CurrentBillingState,
} from '@/features/billing/clerk-billing/projection';
import { describe, expect, it } from 'vitest';

const now = new Date('2026-07-06T12:00:00.000Z');
const futurePeriodEnd = new Date('2026-08-06T12:00:00.000Z');
const laterFreePeriodEnd = new Date('2026-09-06T12:00:00.000Z');
const pastPeriodEnd = new Date('2026-06-06T12:00:00.000Z');

const currentPaidState: CurrentBillingState = {
  subscriptionTier: 'pro',
  subscriptionStatus: 'active',
  subscriptionPeriodEnd: futurePeriodEnd,
  cancelAtPeriodEnd: false,
};

const currentStarterState: CurrentBillingState = {
  subscriptionTier: 'starter',
  subscriptionStatus: 'active',
  subscriptionPeriodEnd: futurePeriodEnd,
  cancelAtPeriodEnd: false,
};

const currentFreeState: CurrentBillingState = {
  subscriptionTier: 'free',
  subscriptionStatus: 'active',
  subscriptionPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

function item(
  overrides: Partial<ClerkBillingProjectionItem>,
): ClerkBillingProjectionItem {
  return {
    id: 'item_fixture',
    status: 'active',
    tier: 'pro',
    planId: 'cplan_fixture',
    planSlug: 'pro_plan',
    amountInCents: 2_000,
    periodEnd: futurePeriodEnd,
    isFreeTrial: false,
    ...overrides,
  };
}

function source(
  overrides: Partial<ClerkBillingProjectionSource>,
): ClerkBillingProjectionSource {
  return {
    type: 'subscription.updated',
    payerUserId: 'user_fixture',
    subscriptionStatus: 'active',
    paymentAttemptStatus: null,
    items: [item({})],
    ...overrides,
  };
}

describe('projectClerkBillingSource', () => {
  it('projects an active paid item into the local paid entitlement', () => {
    expect(
      projectClerkBillingSource(source({}), currentPaidState, now),
    ).toEqual({
      subscriptionTier: 'pro',
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: futurePeriodEnd,
      cancelAtPeriodEnd: false,
    });
  });

  it('retains paid entitlement for a canceled paid item until period end', () => {
    expect(
      projectClerkBillingSource(
        source({
          subscriptionStatus: 'canceled',
          items: [
            item({
              status: 'canceled',
              tier: 'starter',
              planSlug: 'starter_plan',
            }),
          ],
        }),
        currentPaidState,
        now,
      ),
    ).toEqual({
      subscriptionTier: 'starter',
      subscriptionStatus: 'canceled',
      subscriptionPeriodEnd: futurePeriodEnd,
      cancelAtPeriodEnd: true,
    });
  });

  it('does not downgrade an existing paid user on an upcoming free item', () => {
    expect(
      projectClerkBillingSource(
        source({
          items: [
            item({
              status: 'upcoming',
              tier: 'free',
              planSlug: 'free_user',
            }),
          ],
        }),
        currentPaidState,
        now,
      ),
    ).toEqual({
      subscriptionTier: 'pro',
      subscriptionStatus: 'canceled',
      subscriptionPeriodEnd: futurePeriodEnd,
      cancelAtPeriodEnd: true,
    });
  });

  it('downgrades to free after a terminal paid item', () => {
    expect(
      projectClerkBillingSource(
        source({
          subscriptionStatus: 'ended',
          items: [
            item({
              status: 'ended',
              periodEnd: pastPeriodEnd,
            }),
          ],
        }),
        currentPaidState,
        now,
      ),
    ).toEqual({
      subscriptionTier: 'free',
      subscriptionStatus: 'canceled',
      subscriptionPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  });

  it('does not downgrade paid entitlement for an incomplete checkout item', () => {
    expect(
      projectClerkBillingSource(
        source({
          subscriptionStatus: 'incomplete',
          items: [
            item({
              status: 'incomplete',
            }),
          ],
        }),
        currentPaidState,
        now,
      ),
    ).toBeNull();
  });

  it('marks failed payment attempts past due without changing paid tier', () => {
    expect(
      projectClerkBillingSource(
        source({
          subscriptionStatus: null,
          paymentAttemptStatus: 'failed',
          items: [item({ status: 'active' })],
        }),
        currentPaidState,
        now,
      ),
    ).toEqual({
      subscriptionTier: 'pro',
      subscriptionStatus: 'past_due',
      subscriptionPeriodEnd: futurePeriodEnd,
      cancelAtPeriodEnd: false,
    });
  });

  it('does not promote failed checkouts for free users', () => {
    expect(
      projectClerkBillingSource(
        source({
          subscriptionStatus: null,
          paymentAttemptStatus: 'failed',
          items: [
            item({
              status: 'active',
              tier: 'starter',
              planSlug: 'starter_plan',
            }),
          ],
        }),
        currentFreeState,
        now,
      ),
    ).toBeNull();
  });

  it('keeps the existing paid tier on failed upgrade attempts', () => {
    expect(
      projectClerkBillingSource(
        source({
          subscriptionStatus: null,
          paymentAttemptStatus: 'failed',
          items: [item({ status: 'active', tier: 'pro' })],
        }),
        currentStarterState,
        now,
      ),
    ).toEqual({
      subscriptionTier: 'starter',
      subscriptionStatus: 'past_due',
      subscriptionPeriodEnd: futurePeriodEnd,
      cancelAtPeriodEnd: false,
    });
  });

  it('does not promote past-due checkout payloads for free users', () => {
    expect(
      projectClerkBillingSource(
        source({
          subscriptionStatus: 'past_due',
          items: [
            item({
              status: 'past_due',
              tier: 'pro',
            }),
          ],
        }),
        currentFreeState,
        now,
      ),
    ).toBeNull();
  });

  it('keeps the existing paid tier on past-due upgrade attempts', () => {
    expect(
      projectClerkBillingSource(
        source({
          subscriptionStatus: 'past_due',
          items: [item({ status: 'past_due', tier: 'pro' })],
        }),
        currentStarterState,
        now,
      ),
    ).toEqual({
      subscriptionTier: 'starter',
      subscriptionStatus: 'past_due',
      subscriptionPeriodEnd: futurePeriodEnd,
      cancelAtPeriodEnd: false,
    });
  });

  it('does not promote a past-due paid item when reconciliation remains active', () => {
    expect(
      projectClerkBillingSource(
        source({
          type: 'reconciliation.subscription',
          subscriptionStatus: 'active',
          items: [item({ status: 'past_due', tier: 'pro' })],
        }),
        currentFreeState,
        now,
      ),
    ).toBeNull();
  });

  it('keeps the existing paid tier when reconciliation includes a past-due upgrade', () => {
    expect(
      projectClerkBillingSource(
        source({
          type: 'reconciliation.subscription',
          subscriptionStatus: 'active',
          items: [item({ status: 'past_due', tier: 'pro' })],
        }),
        currentStarterState,
        now,
      ),
    ).toEqual({
      subscriptionTier: 'starter',
      subscriptionStatus: 'past_due',
      subscriptionPeriodEnd: futurePeriodEnd,
      cancelAtPeriodEnd: false,
    });
  });

  it('projects an active paid item while ignoring a separate past-due upgrade', () => {
    expect(
      projectClerkBillingSource(
        source({
          type: 'reconciliation.subscription',
          subscriptionStatus: 'active',
          items: [
            item({
              id: 'item_starter_active',
              status: 'active',
              tier: 'starter',
              planSlug: 'starter_plan',
            }),
            item({
              id: 'item_pro_past_due',
              status: 'past_due',
              tier: 'pro',
            }),
          ],
        }),
        currentFreeState,
        now,
      ),
    ).toEqual({
      subscriptionTier: 'starter',
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: futurePeriodEnd,
      cancelAtPeriodEnd: false,
    });
  });

  it('does not extend a paid tier from an upcoming free item after a failed upgrade', () => {
    expect(
      projectClerkBillingSource(
        source({
          type: 'reconciliation.subscription',
          subscriptionStatus: 'active',
          items: [
            item({ status: 'past_due', tier: 'pro' }),
            item({
              id: 'item_free_upcoming',
              status: 'upcoming',
              tier: 'free',
              planSlug: 'free_user',
              periodEnd: laterFreePeriodEnd,
            }),
          ],
        }),
        currentStarterState,
        now,
      ),
    ).toEqual({
      subscriptionTier: 'starter',
      subscriptionStatus: 'past_due',
      subscriptionPeriodEnd: futurePeriodEnd,
      cancelAtPeriodEnd: false,
    });
  });

  it('preserves prior entitlement when Clerk plan slug is unknown', () => {
    expect(
      projectClerkBillingSource(
        source({
          items: [
            item({
              status: 'active',
              tier: null,
              planId: 'cplan_unknown',
              planSlug: 'enterprise_plan',
            }),
          ],
        }),
        currentPaidState,
        now,
      ),
    ).toBeNull();
  });

  it('does not clobber stored tier when a terminal event has unmapped plans', () => {
    expect(
      projectClerkBillingSource(
        source({
          subscriptionStatus: 'ended',
          items: [
            item({
              status: 'ended',
              tier: null,
              planId: 'cplan_unknown',
              planSlug: 'enterprise_plan',
              periodEnd: pastPeriodEnd,
            }),
          ],
        }),
        currentPaidState,
        now,
      ),
    ).toBeNull();
  });

  it('does not infer a paid tier from amount when slug and id are unknown', () => {
    const sourceFromWebhook = clerkBillingSourceFromWebhook({
      type: 'subscriptionItem.active',
      data: {
        id: 'item_priced',
        status: 'active',
        payer: { user_id: 'user_priced' },
        plan_id: 'cplan_unknown',
        plan: null,
        amount: { amount: 2_000 },
        period_end: futurePeriodEnd.getTime(),
      },
    } as unknown as Parameters<typeof clerkBillingSourceFromWebhook>[0]);

    expect(sourceFromWebhook?.items[0]).toEqual(
      expect.objectContaining({
        amountInCents: 2_000,
        tier: null,
      }),
    );
    expect(
      projectClerkBillingSource(sourceFromWebhook!, currentPaidState, now),
    ).toBeNull();
  });

  it('maps Clerk webhook item timestamps and trial state from the payload', () => {
    const sourceFromWebhook = clerkBillingSourceFromWebhook({
      type: 'subscriptionItem.active',
      data: {
        id: 'item_trial',
        status: 'active',
        payer: { user_id: 'user_trial' },
        plan_id: 'cplan_pro_fixture',
        plan: { id: 'cplan_pro_fixture', slug: 'pro_plan' },
        amount: {
          amount: 2_000,
          amount_formatted: '20.00',
          currency: 'USD',
          currency_symbol: '$',
        },
        period_end: futurePeriodEnd.getTime(),
        is_free_trial: true,
      },
    } as unknown as Parameters<typeof clerkBillingSourceFromWebhook>[0]);

    expect(sourceFromWebhook?.items[0]).toEqual(
      expect.objectContaining({
        amountInCents: 2_000,
        isFreeTrial: true,
        periodEnd: futurePeriodEnd,
        planSlug: 'pro_plan',
        tier: 'pro',
      }),
    );
  });

  it('uses payer_id fallback for item and payment-attempt webhooks', () => {
    const subscriptionItemSource = clerkBillingSourceFromWebhook({
      type: 'subscriptionItem.active',
      data: {
        id: 'item_fallback',
        status: 'active',
        payer: {},
        payer_id: 'user_fallback',
        plan_id: 'cplan_pro_fixture',
        plan: { id: 'cplan_pro_fixture', slug: 'pro_plan' },
        amount: { amount: 2_000 },
        period_end: futurePeriodEnd.getTime(),
      },
    } as unknown as Parameters<typeof clerkBillingSourceFromWebhook>[0]);

    const paymentAttemptSource = clerkBillingSourceFromWebhook({
      type: 'paymentAttempt.failed',
      data: {
        id: 'attempt_fallback',
        status: 'failed',
        payer: {},
        payer_id: 'user_fallback',
        subscription_items: [
          {
            id: 'item_fallback',
            status: 'active',
            plan_id: 'cplan_pro_fixture',
            plan: { id: 'cplan_pro_fixture', slug: 'pro_plan' },
            amount: { amount: 2_000 },
            period_end: futurePeriodEnd.getTime(),
          },
        ],
      },
    } as unknown as Parameters<typeof clerkBillingSourceFromWebhook>[0]);

    expect(subscriptionItemSource?.payerUserId).toBe('user_fallback');
    expect(paymentAttemptSource?.payerUserId).toBe('user_fallback');
  });
});
