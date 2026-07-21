import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPlans: vi.fn(),
  useClerk: vi.fn(),
}));

vi.mock(
  '@/app/(marketing)/_shared/after-hours-pricing-cards.module.css',
  () => ({ default: { checkoutMount: 'checkoutMount' } }),
);

vi.mock('@clerk/nextjs', () => ({
  PricingTable: () => (
    <div className='cl-pricingTable'>
      <article className='cl-pricingTableCard cl-pricingTableCard__starter_plan'>
        <div className='cl-pricingTableCardBody'>
          <p className='cl-pricingTableCardFee'>$10</p>
          <p className='cl-pricingTableCardFeePeriod'>Month</p>
        </div>
        <footer className='cl-pricingTableCardFooter'>
          <button className='cl-pricingTableCardFooterButton' type='button'>
            Subscribe
          </button>
        </footer>
      </article>
    </div>
  ),
  useAuth: () => ({ isLoaded: true, userId: 'user_123' }),
  useClerk: mocks.useClerk,
}));

vi.mock('@clerk/nextjs/experimental', () => ({
  CheckoutButton: ({
    children,
    planId,
    planPeriod,
  }: {
    children: React.ReactNode;
    planId: string;
    planPeriod?: string;
  }) => (
    <span data-period={planPeriod} data-testid={`checkout-${planId}`}>
      {children}
    </span>
  ),
}));

describe('AfterHoursClerkPricing', () => {
  beforeEach(() => {
    mocks.useClerk.mockReturnValue({
      billing: { getPlans: mocks.getPlans },
      loaded: true,
    });
  });

  it('still renders when Clerk Billing is unavailable', async () => {
    mocks.useClerk.mockReturnValue({ loaded: true });

    const { AfterHoursClerkPricing } =
      await import('@/app/(marketing)/_shared/AfterHoursClerkPricing');

    render(
      <AfterHoursClerkPricing
        appearance={{}}
        newSubscriptionRedirectUrl='/settings#billing'
      />,
    );

    expect(screen.getByRole('tab', { name: 'Monthly' })).toBeVisible();
  });

  it('fills empty Clerk feature lists and sends the selected period to Clerk checkout', async () => {
    mocks.getPlans.mockResolvedValue({
      data: [
        {
          annualFee: { amount: 9600, amountFormatted: '96.00' },
          annualMonthlyFee: { amount: 800, amountFormatted: '8.00' },
          fee: { amount: 1000, amountFormatted: '10.00' },
          features: [],
          hasBaseFee: true,
          id: 'plan_starter',
          slug: 'starter_plan',
        },
      ],
    });

    const { AfterHoursClerkPricing } =
      await import('@/app/(marketing)/_shared/AfterHoursClerkPricing');
    const user = userEvent.setup();

    render(
      <AfterHoursClerkPricing
        appearance={{}}
        newSubscriptionRedirectUrl='/settings#billing'
      />,
    );

    expect(await screen.findByText('Priority queue access')).toBeVisible();
    const checkout = await screen.findByTestId('checkout-plan_starter');
    expect(checkout).toHaveAttribute('data-period', 'month');
    expect(
      within(checkout).getByRole('button', { name: 'Choose Starter' }),
    ).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Yearly' }));

    expect(screen.getByTestId('checkout-plan_starter')).toHaveAttribute(
      'data-period',
      'annual',
    );
    expect(screen.getByText('$8')).toBeVisible();
  });
});
