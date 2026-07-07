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
const pastPeriodEnd = new Date('2026-06-06T12:00:00.000Z');

const currentPaidState: CurrentBillingState = {
  subscriptionTier: 'pro',
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

  it('maps Clerk webhook item timestamps and trial state from the payload', () => {
    const sourceFromWebhook = clerkBillingSourceFromWebhook({
      type: 'subscriptionItem.active',
      data: {
        id: 'item_trial',
        status: 'active',
        payer: { user_id: 'user_trial' },
        plan_id: 'cplan_3G8pCUUMkJeYVKqZuAanPo0c1Lb',
        plan: null,
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
        tier: 'pro',
      }),
    );
  });
});
