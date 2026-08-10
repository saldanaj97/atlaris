import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act, cloneElement, isValidElement, type ReactElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPlans: vi.fn(),
  getSubscription: vi.fn(),
  openCheckout: vi.fn(),
  openSubscription: vi.fn(),
  useAuth: vi.fn(),
  useClerk: vi.fn(),
}));

vi.mock('@/app/(marketing)/pricing/components/PricingCards.module.css', () => ({
  default: { checkoutButton: 'checkoutButton' },
}));

vi.mock('@clerk/nextjs', () => ({
  PricingTable: () => <div data-testid='native-pricing-table' />,
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
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ onClick?: () => void }>, {
            onClick: () => mocks.openCheckout(planId, planPeriod),
          })
        : children}
    </span>
  ),
  SubscriptionDetailsButton: ({ children }: { children: React.ReactNode }) => (
    <span data-testid='subscription-details'>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ onClick?: () => void }>, {
            onClick: () => mocks.openSubscription(),
          })
        : children}
    </span>
  ),
}));

const FREE_PLAN = {
  annualFee: null,
  annualMonthlyFee: null,
  fee: null,
  features: [],
  id: 'plan_free',
  slug: 'free_user',
};

const STARTER_PLAN = {
  annualFee: { amount: 9600, amountFormatted: '96.00' },
  annualMonthlyFee: { amount: 800, amountFormatted: '8.00' },
  fee: { amount: 1000, amountFormatted: '10.00' },
  features: [],
  hasBaseFee: true,
  id: 'plan_starter',
  slug: 'starter_plan',
};

async function renderPricingTable(): Promise<void> {
  const { ClerkPricingTable } =
    await import('@/app/(marketing)/pricing/components/ClerkPricingTable');
  render(
    <ClerkPricingTable
      appearance={{}}
      newSubscriptionRedirectUrl='/settings#billing'
    />,
  );
}

describe('ClerkPricingTable', () => {
  beforeEach(() => {
    mocks.getPlans.mockReset();
    mocks.getSubscription.mockReset();
    mocks.openCheckout.mockReset();
    mocks.openSubscription.mockReset();
    mocks.getSubscription.mockResolvedValue({ subscriptionItems: [] });
    mocks.useAuth.mockReturnValue({ isLoaded: true, userId: 'user_123' });
    mocks.useClerk.mockReturnValue({
      billing: {
        getPlans: mocks.getPlans,
        getSubscription: mocks.getSubscription,
      },
      loaded: true,
    });
    window.history.replaceState({}, '', '/pricing');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('falls back to Clerk pricing when Clerk Billing is unavailable', async () => {
    mocks.useClerk.mockReturnValue({ loaded: true });

    await renderPricingTable();

    expect(await screen.findByTestId('native-pricing-table')).toBeVisible();
  });

  it('tracks pointer position and resets card parallax', async () => {
    mocks.getPlans.mockResolvedValue({ data: [FREE_PLAN] });
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        matches: query === '(hover: hover) and (pointer: fine)',
        media: query,
        removeEventListener: vi.fn(),
      })),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
    );

    await renderPricingTable();
    const card = await screen.findByRole('article', { name: 'Free' });
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 200,
      toJSON: () => ({}),
      top: 0,
      width: 200,
      x: 0,
      y: 0,
    });

    fireEvent.pointerMove(card, { clientX: 150, clientY: 50 });
    expect(card.style.getPropertyValue('--card-tilt-y')).toBe('2.50deg');
    expect(card.style.getPropertyValue('--card-shine-x')).toBe('75.0%');
    expect(card.style.getPropertyValue('--card-shine-opacity')).toBe('1');

    const root = card.parentElement?.parentElement;
    if (!root) throw new Error('Expected pricing table root');
    fireEvent.pointerLeave(root);
    expect(card.style.getPropertyValue('--card-tilt-y')).toBe('0deg');
    expect(card.style.getPropertyValue('--card-shine-opacity')).toBe('0');
  });

  it('disables parallax pointer tracking for reduced motion', async () => {
    mocks.getPlans.mockResolvedValue({ data: [FREE_PLAN] });
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        removeEventListener: vi.fn(),
      })),
    );
    const requestAnimationFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);

    await renderPricingTable();

    const card = await screen.findByRole('article', { name: 'Free' });
    fireEvent.pointerMove(card, { clientX: 150, clientY: 50 });
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('fills empty Clerk feature lists and sends the selected period to Clerk checkout', async () => {
    mocks.getPlans.mockResolvedValue({ data: [STARTER_PLAN] });
    const user = userEvent.setup();

    await renderPricingTable();

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

  it('hydrates monthly server markup before applying a validated annual checkout URL', async () => {
    const { ClerkPricingTable } =
      await import('@/app/(marketing)/pricing/components/ClerkPricingTable');
    mocks.useAuth.mockReturnValue({ isLoaded: true, userId: null });
    mocks.getPlans.mockResolvedValue({ data: [STARTER_PLAN] });

    vi.stubGlobal('window', undefined);
    let markup: string;
    try {
      markup = renderToString(
        <ClerkPricingTable
          appearance={{}}
          newSubscriptionRedirectUrl='/settings#billing'
        />,
      );
    } finally {
      vi.unstubAllGlobals();
    }

    window.history.replaceState(
      {},
      '',
      '/pricing?checkoutPlan=plan_starter&checkoutPeriod=annual',
    );
    const container = document.createElement('div');
    container.innerHTML = markup;
    document.body.append(container);

    expect(
      within(container).getByRole('button', { name: 'Monthly' }),
    ).toHaveAttribute('aria-pressed', 'true');

    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(
          container,
          <ClerkPricingTable
            appearance={{}}
            newSubscriptionRedirectUrl='/settings#billing'
          />,
          { onRecoverableError },
        );
      });

      await waitFor(() =>
        expect(
          within(container).getByRole('button', { name: 'Yearly' }),
        ).toHaveAttribute('aria-pressed', 'true'),
      );
      expect(within(container).getByText('$8')).toBeVisible();
      expect(onRecoverableError).not.toHaveBeenCalled();
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it("preserves a signed-out visitor's selected plan and period through sign-in", async () => {
    mocks.useAuth.mockReturnValue({ isLoaded: true, userId: null });
    mocks.getPlans.mockResolvedValue({ data: [STARTER_PLAN] });
    const user = userEvent.setup();

    await renderPricingTable();

    expect(await screen.findByTestId('sign-in-checkout')).toHaveAttribute(
      'data-redirect',
      '/pricing?checkoutPlan=plan_starter&checkoutPlanSlug=starter_plan&checkoutPeriod=month',
    );

    await user.click(screen.getByRole('button', { name: 'Yearly' }));

    await waitFor(() =>
      expect(screen.getByTestId('sign-in-checkout')).toHaveAttribute(
        'data-redirect',
        '/pricing?checkoutPlan=plan_starter&checkoutPlanSlug=starter_plan&checkoutPeriod=annual',
      ),
    );
  });

  it('keeps checkout return params in the URL while signed out', async () => {
    window.history.replaceState(
      {},
      '',
      '/pricing?checkoutPlan=plan_starter&checkoutPeriod=annual',
    );
    mocks.useAuth.mockReturnValue({ isLoaded: true, userId: null });
    mocks.getPlans.mockResolvedValue({ data: [STARTER_PLAN] });

    await renderPricingTable();

    expect(await screen.findByTestId('sign-in-checkout')).toHaveAttribute(
      'data-redirect',
      '/pricing?checkoutPlan=plan_starter&checkoutPlanSlug=starter_plan&checkoutPeriod=annual',
    );
    expect(screen.getByRole('button', { name: 'Yearly' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('$8')).toBeVisible();
    expect(window.location.search).toBe(
      '?checkoutPlan=plan_starter&checkoutPeriod=annual',
    );
  });

  it('defaults billing period to monthly when checkoutPeriod is missing or invalid', async () => {
    window.history.replaceState(
      {},
      '',
      '/pricing?checkoutPlan=plan_starter&checkoutPeriod=weekly',
    );
    mocks.useAuth.mockReturnValue({ isLoaded: true, userId: null });
    mocks.getPlans.mockResolvedValue({ data: [STARTER_PLAN] });

    await renderPricingTable();

    expect(await screen.findByTestId('sign-in-checkout')).toHaveAttribute(
      'data-redirect',
      '/pricing?checkoutPlan=plan_starter&checkoutPlanSlug=starter_plan&checkoutPeriod=month',
    );
    expect(screen.getByRole('button', { name: 'Monthly' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('$10')).toBeVisible();
  });

  it('waits for auth to load before showing signed-out checkout actions', async () => {
    mocks.useAuth.mockReturnValue({ isLoaded: false, userId: null });
    mocks.getPlans.mockResolvedValue({ data: [STARTER_PLAN] });

    await renderPricingTable();

    expect(
      await screen.findByRole('button', { name: 'Choose Starter' }),
    ).toBeDisabled();
    expect(screen.queryByTestId('sign-in-checkout')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('checkout-plan_starter'),
    ).not.toBeInTheDocument();
  });

  it('restores a validated annual checkout selection after authentication', async () => {
    window.history.replaceState(
      {},
      '',
      '/pricing?checkoutPlan=plan_starter&checkoutPeriod=annual',
    );
    mocks.getPlans.mockResolvedValue({ data: [STARTER_PLAN] });

    await renderPricingTable();

    await waitFor(() =>
      expect(mocks.openCheckout).toHaveBeenCalledWith('plan_starter', 'annual'),
    );
    expect(window.location.search).toBe('');
  });

  it('resumes the paid plan when free and paid tiers share a Clerk plan ID', async () => {
    window.history.replaceState(
      {},
      '',
      '/pricing?checkoutPlan=shared_plan&checkoutPeriod=month',
    );
    mocks.getPlans.mockResolvedValue({
      data: [
        { ...FREE_PLAN, id: 'shared_plan' },
        {
          ...STARTER_PLAN,
          annualFee: null,
          annualMonthlyFee: null,
          id: 'shared_plan',
        },
      ],
    });

    await renderPricingTable();

    await waitFor(() =>
      expect(mocks.openCheckout).toHaveBeenCalledWith('shared_plan', 'month'),
    );
  });

  it('uses Clerk subscription actions for the current plan and downgrades', async () => {
    mocks.getSubscription.mockResolvedValue({
      subscriptionItems: [
        {
          plan: { hasBaseFee: true, slug: 'starter_plan' },
          status: 'active',
        },
      ],
    });
    mocks.getPlans.mockResolvedValue({
      data: [
        FREE_PLAN,
        {
          ...STARTER_PLAN,
          annualFee: null,
          annualMonthlyFee: null,
        },
      ],
    });

    await renderPricingTable();

    expect(
      await screen.findByRole('button', { name: 'Current plan' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Manage subscription' }),
    ).toBeVisible();
  });

  it('uses an annual-only plan price and checkout period on the monthly view', async () => {
    mocks.getPlans.mockResolvedValue({
      data: [{ ...STARTER_PLAN, fee: null }],
    });

    await renderPricingTable();

    expect(await screen.findByText('$8')).toBeVisible();
    expect(screen.getByTestId('checkout-plan_starter')).toHaveAttribute(
      'data-period',
      'annual',
    );
  });

  it('marks yearly pricing as coming soon when no plan has an annual price', async () => {
    mocks.getPlans.mockResolvedValue({
      data: [
        {
          ...STARTER_PLAN,
          annualFee: null,
          annualMonthlyFee: null,
        },
      ],
    });

    await renderPricingTable();

    expect(
      await screen.findByRole('button', { name: 'Yearly · Soon' }),
    ).toBeDisabled();
  });

  it('falls back to Clerk pricing when custom plan loading fails', async () => {
    window.history.replaceState(
      {},
      '',
      '/pricing?checkoutPlan=plan_starter&checkoutPeriod=annual',
    );
    mocks.getPlans.mockRejectedValue(new Error('network unavailable'));

    await renderPricingTable();

    expect(await screen.findByTestId('native-pricing-table')).toBeVisible();
    expect(window.location.search).toBe('');
  });

  it('renders the monthly fee from Clerk plan data', async () => {
    mocks.getPlans.mockResolvedValue({ data: [STARTER_PLAN] });

    await renderPricingTable();

    expect(await screen.findByText('$10')).toBeVisible();
  });
});
