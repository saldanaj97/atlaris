import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPlans: vi.fn(),
  openCheckout: vi.fn(),
  useAuth: vi.fn(),
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
  useAuth: mocks.useAuth,
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

const starterPlan = {
  annualFee: { amount: 9600, amountFormatted: '96.00' },
  annualMonthlyFee: { amount: 800, amountFormatted: '8.00' },
  fee: { amount: 1000, amountFormatted: '10.00' },
  features: [],
  hasBaseFee: true,
  id: 'plan_starter',
  slug: 'starter_plan',
};

describe('AfterHoursClerkPricing', () => {
  beforeEach(() => {
    mocks.getPlans.mockReset();
    mocks.openCheckout.mockReset();
    mocks.useAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });
    mocks.useClerk.mockReturnValue({
      __internal_openCheckout: mocks.openCheckout,
      billing: { getPlans: mocks.getPlans },
      loaded: true,
    });
  });

  it('still renders when Clerk Billing is unavailable', async () => {
    mocks.useClerk.mockReturnValue({
      __internal_openCheckout: mocks.openCheckout,
      loaded: true,
    });

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
    mocks.getPlans.mockResolvedValue({ data: [starterPlan] });

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

  it('opens signed-out checkout with the selected yearly period', async () => {
    mocks.useAuth.mockReturnValue({ isLoaded: true, userId: null });
    mocks.getPlans.mockResolvedValue({ data: [starterPlan] });

    const { AfterHoursClerkPricing } =
      await import('@/app/(marketing)/_shared/AfterHoursClerkPricing');
    const user = userEvent.setup();

    render(
      <AfterHoursClerkPricing
        appearance={{ elements: { rootBox: 'w-full' } }}
        newSubscriptionRedirectUrl='/settings#billing'
      />,
    );

    expect(await screen.findByText('Priority queue access')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Yearly' }));
    expect(screen.getByText('$8')).toBeVisible();

    const checkoutMount = document.querySelector(
      '[data-atlaris-checkout="plan_starter"]',
    );
    expect(checkoutMount).toBeInstanceOf(HTMLElement);
    await user.click(
      within(checkoutMount as HTMLElement).getByRole('button', {
        name: 'Choose Starter',
      }),
    );

    expect(mocks.openCheckout).toHaveBeenCalledWith({
      appearance: { elements: { rootBox: 'w-full' } },
      newSubscriptionRedirectUrl: '/settings#billing',
      planId: 'plan_starter',
      planPeriod: 'annual',
    });
  });
});
