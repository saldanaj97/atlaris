import { ROUTES } from '@/features/navigation/routes';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clerkPricingTableMock: vi.fn(),
  getOptionalCheckoutBillingSignatureMock: vi.fn(),
  shouldUseClerkUiMock: vi.fn(() => true),
}));

vi.mock('@/app/(marketing)/pricing/components/PricingCards.module.css', () => ({
  default: {},
}));

vi.mock('@/app/(marketing)/_shared/star-field.module.css', () => ({
  default: { star: 'star' },
}));

vi.mock('@/app/(marketing)/pricing/components/Pricing.module.css', () => ({
  default: {
    heroOverline: 'heroOverline',
    heroSubline: 'heroSubline',
    heroWord: 'heroWord',
    shell: 'shell',
  },
}));

vi.mock('@/features/billing/checkout-return-server', () => ({
  getOptionalCheckoutBillingSignature:
    mocks.getOptionalCheckoutBillingSignatureMock,
}));

vi.mock('@/lib/auth/local-identity', () => ({
  shouldUseClerkUi: mocks.shouldUseClerkUiMock,
}));

vi.mock('@/app/(marketing)/pricing/components/ClerkPricingTable', () => ({
  ClerkPricingTable: (props: { newSubscriptionRedirectUrl?: string }) => {
    mocks.clerkPricingTableMock(props);
    return <div data-testid='clerk-pricing-table' />;
  },
}));

async function renderPricingPage(): Promise<void> {
  vi.resetModules();
  const { default: PricingPage } =
    await import('@/app/(marketing)/pricing/page');
  render(await PricingPage());
}

describe('PricingPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getOptionalCheckoutBillingSignatureMock.mockResolvedValue(
      'free|active||0',
    );
    mocks.shouldUseClerkUiMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders Clerk Billing pricing with the billing settings redirect', async () => {
    await renderPricingPage();

    expect(
      screen.getByRole('heading', {
        name: /one sky\. three ways to cross it\./i,
      }),
    ).toBeVisible();
    expect(screen.getByText(/chart your course/i)).toBeVisible();
    expect(screen.getByTestId('clerk-pricing-table')).toBeVisible();
    expect(mocks.clerkPricingTableMock).toHaveBeenCalledWith(
      expect.objectContaining({
        newSubscriptionRedirectUrl: `${ROUTES.SETTINGS.ROOT}?checkout=1&checkoutBaseline=free%7Cactive%7C%7C0#billing`,
      }),
    );
  });

  it('renders local pricing fixtures instead of Clerk when Clerk UI is disabled', async () => {
    mocks.shouldUseClerkUiMock.mockReturnValue(false);

    await renderPricingPage();

    expect(screen.queryByTestId('clerk-pricing-table')).not.toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: /billing period/i }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Free' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Starter' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Pro' })).toBeVisible();
    expect(screen.getByText(/local pricing preview/i)).toBeVisible();
    expect(
      screen.getAllByRole('button', { name: /preview only/i }),
    ).toHaveLength(3);

    expect(
      screen.getByRole('button', { name: 'Yearly · Soon' }),
    ).toBeDisabled();
  });
});
