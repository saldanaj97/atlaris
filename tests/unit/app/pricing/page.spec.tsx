import { ROUTES } from '@/features/navigation/routes';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clerkPricingTableMock: vi.fn(),
  getOptionalCheckoutBillingSignatureMock: vi.fn(),
  resolveSiteGateMock: vi.fn(),
  shouldUseClerkUiMock: vi.fn(() => true),
  cookiesHasMock: vi.fn(),
  getSessionSafeMock: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  getSessionSafe: mocks.getSessionSafeMock,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ has: mocks.cookiesHasMock }),
}));

vi.mock('@/app/(landing)/pricing/components/PricingCards.module.css', () => ({
  default: {},
}));

vi.mock('@/app/(landing)/_shared/star-field.module.css', () => ({
  default: { star: 'star' },
}));

vi.mock('@/app/(landing)/pricing/components/Pricing.module.css', () => ({
  default: {
    heroSubline: 'heroSubline',
    shell: 'shell',
  },
}));

vi.mock('@/features/billing/checkout-return-server', () => ({
  getOptionalCheckoutBillingSignature:
    mocks.getOptionalCheckoutBillingSignatureMock,
}));

vi.mock('@/lib/proxy/site-gate', () => ({
  FLAG_OVERRIDES_COOKIE: 'vercel-flag-overrides',
  resolveSiteGate: mocks.resolveSiteGateMock,
}));

vi.mock('@/lib/auth/local-identity', () => ({
  shouldUseClerkUi: mocks.shouldUseClerkUiMock,
}));

vi.mock('@/app/(landing)/pricing/components/ClerkPricingTable', () => ({
  ClerkPricingTable: (props: { newSubscriptionRedirectUrl?: string }) => {
    mocks.clerkPricingTableMock(props);
    return <div data-testid='clerk-pricing-table' />;
  },
}));

async function renderPricingPage(): Promise<void> {
  vi.resetModules();
  const { default: PricingPage } = await import('@/app/(landing)/pricing/page');
  render(await PricingPage());
}

describe('PricingPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getOptionalCheckoutBillingSignatureMock.mockResolvedValue(
      'free|active||0',
    );
    mocks.shouldUseClerkUiMock.mockReturnValue(true);
    mocks.resolveSiteGateMock.mockResolvedValue(null);
    mocks.cookiesHasMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders Clerk Billing pricing with the billing settings redirect', async () => {
    await renderPricingPage();

    expect(
      screen.getByRole('heading', {
        name: 'Free for one plan. Pay when you need more',
      }),
    ).toBeVisible();
    expect(screen.getByTestId('clerk-pricing-table')).toBeVisible();
    expect(
      screen.getByRole('heading', {
        name: 'Your first plan is free',
      }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Create a plan' })).toHaveAttribute(
      'href',
      ROUTES.PLANS.NEW,
    );
    expect(mocks.clerkPricingTableMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appClosed: false,
        newSubscriptionRedirectUrl: `${ROUTES.SETTINGS.BILLING}?checkout=1&checkoutBaseline=free%7Cactive%7C%7C0`,
      }),
    );
  });

  it.each([
    ['maintenance', 'user_1'],
    ['waitlist', null],
  ] as const)(
    'keeps pricing visible behind the %s gate without reading account billing state (user %s)',
    async (gate, userId) => {
      mocks.resolveSiteGateMock.mockResolvedValue(gate);
      mocks.getSessionSafeMock.mockResolvedValue({
        session: userId ? { user: { id: userId } } : null,
      });

      await renderPricingPage();

      expect(screen.getByTestId('clerk-pricing-table')).toBeVisible();
      expect(
        mocks.getOptionalCheckoutBillingSignatureMock,
      ).not.toHaveBeenCalled();
      expect(mocks.clerkPricingTableMock).toHaveBeenCalledWith(
        expect.objectContaining({ appClosed: true }),
      );
    },
  );

  it('opens pricing to a signed-in user behind the launch waitlist', async () => {
    mocks.resolveSiteGateMock.mockResolvedValue('waitlist');
    mocks.getSessionSafeMock.mockResolvedValue({
      session: { user: { id: 'user_invited' } },
    });

    await renderPricingPage();

    expect(mocks.getOptionalCheckoutBillingSignatureMock).toHaveBeenCalled();
    expect(mocks.clerkPricingTableMock).toHaveBeenCalledWith(
      expect.objectContaining({ appClosed: false }),
    );
  });

  it.each([false, true])(
    'bypasses the site gate cache only when the flag override cookie is present (%s)',
    async (hasOverrides) => {
      mocks.cookiesHasMock.mockReturnValue(hasOverrides);

      await renderPricingPage();

      expect(mocks.cookiesHasMock).toHaveBeenCalledWith(
        'vercel-flag-overrides',
      );
      expect(mocks.resolveSiteGateMock).toHaveBeenCalledWith({
        bypassCache: hasOverrides,
      });
    },
  );

  it('renders local pricing fixtures instead of Clerk when Clerk UI is disabled', async () => {
    mocks.shouldUseClerkUiMock.mockReturnValue(false);

    await renderPricingPage();

    expect(screen.queryByTestId('clerk-pricing-table')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Free' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Starter' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Pro' })).toBeVisible();
    expect(screen.getByText(/local pricing preview/i)).toBeVisible();
    expect(
      screen.getAllByRole('button', { name: /preview only/i }),
    ).toHaveLength(3);

    expect(
      screen.queryByRole('group', { name: 'Billing period' }),
    ).not.toBeInTheDocument();
  });
});
