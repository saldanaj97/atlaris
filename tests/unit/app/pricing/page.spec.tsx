import { render, screen } from '@testing-library/react';
import { createStripeTierMap } from '@tests/fixtures/pricing';
import { buildUserFixture } from '@tests/fixtures/users';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { fetchStripeTierData } from '@/app/pricing/components/stripe-pricing';

type FetchStripeTierDataArgs = Parameters<typeof fetchStripeTierData>[0];
type PricingPageUser = ReturnType<typeof buildUserFixture>;

const mocks = vi.hoisted(() => ({
  withServerComponentContextMock: vi.fn(),
  getCurrentUserRecordSafeMock: vi.fn(),
  fetchStripeTierDataMock: vi.fn(),
  pricingGridMock: vi.fn(),
  pricingMissingStripeNoticeMock: vi.fn(),
  manageSubscriptionButtonMock: vi.fn(),
  loggerMock: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/lib/api/auth', () => ({
  withServerComponentContext: mocks.withServerComponentContextMock,
  getCurrentUserRecordSafe: mocks.getCurrentUserRecordSafeMock,
}));

vi.mock('@/app/pricing/components/stripe-pricing', () => ({
  fetchStripeTierData: mocks.fetchStripeTierDataMock,
}));

vi.mock('@/lib/logging/logger', () => ({
  logger: mocks.loggerMock,
}));

vi.mock('@/app/pricing/components/pricing-config', () => ({
  MONTHLY_TIER_CONFIGS: [
    { key: 'free' },
    { key: 'starter', priceId: 'price_starter_monthly' },
    { key: 'pro', priceId: 'price_pro_monthly' },
  ],
  YEARLY_TIER_CONFIGS: [
    { key: 'free' },
    { key: 'starter', priceId: 'price_starter_yearly' },
    { key: 'pro', priceId: 'price_pro_yearly' },
  ],
}));

vi.mock('@/app/pricing/components/PricingGrid', () => ({
  PricingGrid: (props: {
    subscribeLabel: string;
    stripeData: ReadonlyMap<string, unknown>;
  }) => {
    mocks.pricingGridMock(props);
    return (
      <div
        data-testid={`pricing-grid-${props.subscribeLabel.toLowerCase().replaceAll(' ', '-')}`}
      >
        {props.subscribeLabel}
      </div>
    );
  },
}));

vi.mock('@/app/pricing/components/PricingMissingStripeNotice', () => ({
  PricingMissingStripeNotice: () => {
    mocks.pricingMissingStripeNoticeMock();
    return <div>Missing Stripe pricing data</div>;
  },
}));

vi.mock('@/components/billing/ManageSubscriptionButton', () => ({
  default: (props: { canOpenBillingPortal: boolean }) => {
    mocks.manageSubscriptionButtonMock(props);
    return (
      <div
        data-testid="manage-subscription-button"
        data-can-open-billing-portal={String(props.canOpenBillingPortal)}
      />
    );
  },
}));

async function renderPricingPage(): Promise<void> {
  // Reset the module cache before dynamically importing '@/app/pricing/page'
  // so each render picks up the fresh mock graph for this test.
  vi.resetModules();
  const { default: PricingPage } = await import('@/app/pricing/page');
  render(await PricingPage());
}

function mockAuthenticatedUser(user: PricingPageUser): void {
  mocks.withServerComponentContextMock.mockImplementation(async (resolver) =>
    resolver(user)
  );
}

function mockStripeTierData(
  monthlyStripeData = createStripeTierMap(['starter', 'pro']),
  yearlyStripeData = createStripeTierMap(['starter', 'pro'])
): void {
  mocks.fetchStripeTierDataMock.mockImplementation(
    async (priceIds: FetchStripeTierDataArgs) => {
      const starterId = priceIds?.starterId;
      return typeof starterId === 'string' && starterId.includes('monthly')
        ? monthlyStripeData
        : yearlyStripeData;
    }
  );
}

describe('PricingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUserRecordSafeMock.mockImplementation(() => {
      throw new Error('PricingPage should not call getCurrentUserRecordSafe');
    });
  });
  it('uses withServerComponentContext to render an authenticated pricing page', async () => {
    const user = buildUserFixture({
      stripeCustomerId: 'cus_local_test',
      subscriptionStatus: 'active',
    });
    const monthlyStripeData = createStripeTierMap(['starter', 'pro']);
    const yearlyStripeData = createStripeTierMap(['starter', 'pro']);

    mockAuthenticatedUser(user);
    mockStripeTierData(monthlyStripeData, yearlyStripeData);

    await renderPricingPage();

    expect(mocks.withServerComponentContextMock).toHaveBeenCalledTimes(1);
    expect(mocks.getCurrentUserRecordSafeMock).not.toHaveBeenCalled();
    expect(mocks.fetchStripeTierDataMock).toHaveBeenCalledTimes(2);
    expect(mocks.fetchStripeTierDataMock).toHaveBeenNthCalledWith(1, {
      proId: 'price_pro_monthly',
      starterId: 'price_starter_monthly',
    });
    expect(mocks.fetchStripeTierDataMock).toHaveBeenNthCalledWith(2, {
      proId: 'price_pro_yearly',
      starterId: 'price_starter_yearly',
    });
    expect(
      screen.getByRole('heading', { name: /invest in your growth/i })
    ).toBeVisible();
    expect(screen.getByTestId('pricing-grid-subscribe-monthly')).toBeVisible();
    expect(
      screen.queryByText('Missing Stripe pricing data')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('manage-subscription-button')).toHaveAttribute(
      'data-can-open-billing-portal',
      'true'
    );
    expect(mocks.pricingGridMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        stripeData: monthlyStripeData,
        subscribeLabel: 'Subscribe monthly',
      })
    );
    expect(mocks.pricingGridMock).toHaveBeenCalledTimes(1);
    expect(mocks.loggerMock.warn).not.toHaveBeenCalled();
    expect(mocks.loggerMock.error).not.toHaveBeenCalled();
  });

  it('renders the fallback notice when stripe pricing data is incomplete', async () => {
    const user = buildUserFixture();

    mockAuthenticatedUser(user);
    mocks.fetchStripeTierDataMock
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(createStripeTierMap(['starter']));

    await renderPricingPage();

    expect(screen.getByText('Missing Stripe pricing data')).toBeVisible();
    expect(mocks.loggerMock.error).not.toHaveBeenCalled();
    expect(mocks.loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        monthlyLoadedTierKeys: [],
        monthlyMissingTierKeys: ['starter', 'pro'],
        yearlyLoadedTierKeys: ['starter'],
        yearlyMissingTierKeys: ['pro'],
      }),
      expect.stringContaining('Incomplete Stripe pricing data detected')
    );
    expect(mocks.pricingGridMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        stripeData: new Map(),
      })
    );
    expect(mocks.pricingGridMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    undefined,
    null,
  ] as const)('disables the billing portal when stripeCustomerId is %s', async (stripeCustomerId) => {
    const user = buildUserFixture({
      stripeCustomerId,
      subscriptionStatus: 'active',
    });

    mockAuthenticatedUser(user);
    mockStripeTierData();

    await renderPricingPage();

    expect(mocks.withServerComponentContextMock).toHaveBeenCalledTimes(1);
    expect(mocks.fetchStripeTierDataMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('manage-subscription-button')).toHaveAttribute(
      'data-can-open-billing-portal',
      'false'
    );
  });

  it.each([
    ['trialing'],
    ['canceled'],
    ['past_due'],
  ] as const)('keeps billing portal access enabled for %s subscriptions', async (subscriptionStatus) => {
    const user = buildUserFixture({
      stripeCustomerId: 'cus_local_test',
      subscriptionStatus,
    });

    mockAuthenticatedUser(user);
    mockStripeTierData();

    await renderPricingPage();

    expect(
      screen.queryByText(
        'Billing portal is available after your first subscription checkout.'
      )
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('manage-subscription-button')).toHaveAttribute(
      'data-can-open-billing-portal',
      'true'
    );
  });
});
