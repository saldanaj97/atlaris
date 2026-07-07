import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pricingTableMock: vi.fn(),
}));

vi.mock('@clerk/nextjs', () => ({
  PricingTable: (props: { newSubscriptionRedirectUrl?: string }) => {
    mocks.pricingTableMock(props);
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
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders Clerk Billing pricing with the billing settings redirect', async () => {
    await renderPricingPage();

    expect(
      screen.getByRole('heading', { name: /invest in your growth/i }),
    ).toBeVisible();
    expect(screen.getByTestId('clerk-pricing-table')).toBeVisible();
    expect(mocks.pricingTableMock).toHaveBeenCalledWith(
      expect.objectContaining({
        newSubscriptionRedirectUrl: '/settings/billing',
      }),
    );
  });
});
