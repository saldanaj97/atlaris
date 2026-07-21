import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPlans: vi.fn(),
  pricingFee: '$10',
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
          <p className='cl-pricingTableCardFee'>{mocks.pricingFee}</p>
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
  SignInButton: ({
    children,
    forceRedirectUrl,
  }: {
    children: React.ReactNode;
    forceRedirectUrl: string;
  }) => (
    <span data-redirect={forceRedirectUrl} data-testid='sign-in-checkout'>
      {children}
    </span>
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

describe('AfterHoursClerkPricing', () => {
  beforeEach(() => {
    mocks.getPlans.mockReset();
    mocks.pricingFee = '$10';
    mocks.useAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });
    mocks.useClerk.mockReturnValue({
      billing: { getPlans: mocks.getPlans },
      loaded: true,
    });
    window.history.replaceState({}, '', '/pricing');
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

    expect(screen.getByRole('button', { name: 'Monthly' })).toBeVisible();
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

    await user.click(screen.getByRole('button', { name: 'Yearly' }));

    expect(screen.getByTestId('checkout-plan_starter')).toHaveAttribute(
      'data-period',
      'annual',
    );
    expect(screen.getByText('$8')).toBeVisible();
  });

  it("preserves a signed-out visitor's selected plan and period through sign-in", async () => {
    mocks.useAuth.mockReturnValue({ isLoaded: true, userId: null });
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

    expect(await screen.findByTestId('sign-in-checkout')).toHaveAttribute(
      'data-redirect',
      '/pricing?checkoutPlan=plan_starter&checkoutPeriod=month',
    );

    await user.click(screen.getByRole('button', { name: 'Yearly' }));

    expect(await screen.findByTestId('sign-in-checkout')).toHaveAttribute(
      'data-redirect',
      '/pricing?checkoutPlan=plan_starter&checkoutPeriod=annual',
    );
  });

  it('restores a validated annual checkout selection after authentication', async () => {
    window.history.replaceState(
      {},
      '',
      '/pricing?checkoutPlan=plan_starter&checkoutPeriod=annual',
    );
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

    render(
      <AfterHoursClerkPricing
        appearance={{}}
        newSubscriptionRedirectUrl='/settings#billing'
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('checkout-plan_starter')).toHaveAttribute(
        'data-period',
        'annual',
      ),
    );
    expect(window.location.search).toBe('');
  });

  it.each([
    ['empty', ''],
    ['Clerk annual', '$96'],
  ])(
    'uses Clerk plan data when the rendered fee starts %s',
    async (_label, renderedFee) => {
      mocks.pricingFee = renderedFee;
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

      render(
        <AfterHoursClerkPricing
          appearance={{}}
          newSubscriptionRedirectUrl='/settings#billing'
        />,
      );

      expect(await screen.findByText('$10')).toBeVisible();
    },
  );
});
