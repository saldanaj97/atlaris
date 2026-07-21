import { ROUTES } from '@/features/navigation/routes';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clerkPlansMock: vi.fn(),
  pricingTableMock: vi.fn(),
  shouldUseClerkUiMock: vi.fn(() => true),
}));

vi.mock('@/lib/auth/local-identity', () => ({
  shouldUseClerkUi: mocks.shouldUseClerkUiMock,
}));

vi.mock('@clerk/nextjs', () => ({
  PricingTable: (props: { newSubscriptionRedirectUrl?: string }) => {
    mocks.pricingTableMock(props);
    return <div data-testid='clerk-pricing-table' />;
  },
  useAuth: () => ({ isLoaded: true, userId: null }),
  useClerk: () => ({ billing: { getPlans: mocks.clerkPlansMock } }),
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
    mocks.clerkPlansMock.mockResolvedValue({ data: [] });
    mocks.shouldUseClerkUiMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders Clerk Billing pricing with the billing settings redirect', async () => {
    await renderPricingPage();

    expect(
      screen.getByRole('heading', { name: /structured learning that fits/i }),
    ).toBeVisible();
    expect(screen.getByText(/choose your plan/i)).toBeVisible();
    expect(
      screen.getByText(/plans, modules, tasks, and analytics/i),
    ).toBeVisible();
    expect(
      screen.getByRole('tablist', { name: /billing period/i }),
    ).toBeVisible();
    expect(screen.getByRole('tab', { name: /^monthly$/i })).toBeVisible();
    expect(screen.getByRole('tab', { name: /^yearly$/i })).toBeVisible();
    expect(screen.getByTestId('clerk-pricing-table')).toBeVisible();
    expect(mocks.pricingTableMock).toHaveBeenCalledWith(
      expect.objectContaining({
        newSubscriptionRedirectUrl: `${ROUTES.SETTINGS.ROOT}#billing`,
      }),
    );
  });

  it('renders local billing notice instead of Clerk pricing when Clerk UI is disabled', async () => {
    mocks.shouldUseClerkUiMock.mockReturnValue(false);

    await renderPricingPage();

    expect(screen.queryByTestId('clerk-pricing-table')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tablist', { name: /billing period/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.getByText(/local product testing mode/i)).toBeVisible();
    expect(screen.getByText(/billing:clerk:fixture/i)).toBeVisible();
  });
});
