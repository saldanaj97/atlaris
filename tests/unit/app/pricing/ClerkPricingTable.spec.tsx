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

vi.mock('@/app/(landing)/pricing/components/PricingCards.module.css', () => ({
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
  SignUpButton: ({
    children,
    forceRedirectUrl,
  }: {
    children: React.ReactNode;
    forceRedirectUrl: string;
  }) => (
    <span data-redirect={forceRedirectUrl} data-testid='sign-up-free'>
      {children}
    </span>
  ),
  useAuth: mocks.useAuth,
  useClerk: mocks.useClerk,
}));

vi.mock('@clerk/nextjs/experimental', () => ({
  CheckoutButton: ({
    children,
    newSubscriptionRedirectUrl,
    planId,
    planPeriod,
  }: {
    children: React.ReactNode;
    newSubscriptionRedirectUrl?: string;
    planId: string;
    planPeriod?: string;
  }) => (
    <span
      data-period={planPeriod}
      data-redirect={newSubscriptionRedirectUrl}
      data-testid={`checkout-${planId}`}
    >
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

const PRO_PLAN = {
  annualFee: { amount: 19200, amountFormatted: '192.00' },
  annualMonthlyFee: { amount: 1600, amountFormatted: '16.00' },
  fee: { amount: 2000, amountFormatted: '20.00' },
  features: [],
  hasBaseFee: true,
  id: 'plan_pro',
  slug: 'pro_plan',
};

async function renderPricingTable(
  options: { appClosed?: boolean } = {},
): Promise<void> {
  const { ClerkPricingTable } =
    await import('@/app/(landing)/pricing/components/ClerkPricingTable');
  render(
    <ClerkPricingTable
      appClosed={options.appClosed}
      newSubscriptionRedirectUrl='/settings/billing'
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

  it('shows a retryable error when Clerk Billing is unavailable and recovers without export copy', async () => {
    mocks.useClerk.mockReturnValue({ loaded: true });
    const user = userEvent.setup();

    await renderPricingTable();

    expect(
      screen.queryByTestId('native-pricing-table'),
    ).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(screen.queryByText(/\bexports?\b/i)).not.toBeInTheDocument();

    mocks.useClerk.mockReturnValue({
      billing: {
        getPlans: mocks.getPlans,
        getSubscription: mocks.getSubscription,
      },
      loaded: true,
    });
    mocks.getPlans.mockResolvedValue({
      data: [
        {
          ...STARTER_PLAN,
          features: [
            { name: '10 active learning plans' },
            { name: '50 exports per month' },
            { name: 'Priority queue access' },
          ],
        },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('10 active plans')).toBeVisible();
    expect(screen.queryByText('Priority queue access')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('native-pricing-table'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/\bexports?\b/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('checkout-plan_starter')).toBeVisible();
  });

  it.each([
    { label: 'signed out', userId: null },
    { label: 'signed in', userId: 'user_123' },
  ])(
    'routes every plan CTA to sign-in while the app is closed when $label',
    async ({ userId }) => {
      mocks.useAuth.mockReturnValue({ isLoaded: true, userId });
      mocks.getPlans.mockResolvedValue({
        data: [FREE_PLAN, STARTER_PLAN, PRO_PLAN],
      });

      await renderPricingTable({ appClosed: true });

      expect(
        await screen.findByRole('link', { name: 'Begin with Starter' }),
      ).toHaveAttribute('href', '/auth/sign-in');
      for (const name of ['Start free', 'Begin with Pro']) {
        expect(screen.getByRole('link', { name })).toHaveAttribute(
          'href',
          '/auth/sign-in',
        );
      }
      expect(screen.queryByTestId('sign-in-checkout')).not.toBeInTheDocument();
      expect(screen.queryByTestId(/^checkout-/)).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('subscription-details'),
      ).not.toBeInTheDocument();
    },
  );

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

  it('renders card copy from tier limits instead of Clerk plan copy', async () => {
    mocks.getPlans.mockResolvedValue({
      data: [
        {
          ...STARTER_PLAN,
          description: 'Up to 10 active learning plans with curated models',
          features: [
            { name: '10 active learning plans' },
            { name: '50 exports per month' },
            { name: 'Priority queue access' },
          ],
        },
      ],
    });

    await renderPricingTable();

    expect(await screen.findByText('10 active plans')).toBeVisible();
    expect(screen.getByText('Plans up to 8 weeks')).toBeVisible();
    expect(screen.getByText('For building a steady practice.')).toBeVisible();
    expect(screen.queryByText(/curated models$/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/10 active learning plans|priority queue/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/exports per month/i)).not.toBeInTheDocument();
  });

  it('fills empty Clerk feature lists and sends the selected period to Clerk checkout', async () => {
    mocks.getPlans.mockResolvedValue({ data: [STARTER_PLAN] });
    const user = userEvent.setup();

    await renderPricingTable();

    expect(
      await screen.findByText('Choose from a curated model list'),
    ).toBeVisible();
    const checkout = await screen.findByTestId('checkout-plan_starter');
    expect(checkout).toHaveAttribute('data-period', 'month');
    expect(
      within(checkout).getByRole('button', { name: 'Begin with Starter' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Yearly' }));

    expect(screen.getByTestId('checkout-plan_starter')).toHaveAttribute(
      'data-period',
      'annual',
    );
    expect(screen.getByText('$8')).toBeVisible();
  });

  it('hydrates server markup before applying a validated annual checkout URL', async () => {
    const { ClerkPricingTable } =
      await import('@/app/(landing)/pricing/components/ClerkPricingTable');
    mocks.useAuth.mockReturnValue({ isLoaded: true, userId: null });
    mocks.getPlans.mockResolvedValue({ data: [STARTER_PLAN] });

    vi.stubGlobal('window', undefined);
    let markup: string;
    try {
      markup = renderToString(
        <ClerkPricingTable newSubscriptionRedirectUrl='/settings/billing' />,
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

    // Plans load on the client, so the server cannot know yet whether a
    // yearly price exists and renders no billing period toggle.
    expect(
      within(container).queryByRole('group', { name: 'Billing period' }),
    ).not.toBeInTheDocument();

    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(
          container,
          <ClerkPricingTable newSubscriptionRedirectUrl='/settings/billing' />,
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

  it('opens sign-up from the free plan for a signed-out visitor', async () => {
    mocks.useAuth.mockReturnValue({ isLoaded: true, userId: null });
    mocks.getPlans.mockResolvedValue({ data: [FREE_PLAN] });

    await renderPricingTable();

    expect(await screen.findByTestId('sign-up-free')).toHaveAttribute(
      'data-redirect',
      '/plans/new',
    );
    expect(screen.queryByTestId('sign-in-checkout')).not.toBeInTheDocument();
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

    // Plans paint with default month first; URL hydration flips to annual after.
    await waitFor(() =>
      expect(screen.getByTestId('sign-in-checkout')).toHaveAttribute(
        'data-redirect',
        '/pricing?checkoutPlan=plan_starter&checkoutPlanSlug=starter_plan&checkoutPeriod=annual',
      ),
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
      await screen.findByRole('button', { name: 'Begin with Starter' }),
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
      '/pricing?checkoutPlan=plan_starter&checkoutPeriod=annual&checkoutConsent=1',
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
      '/pricing?checkoutPlan=shared_plan&checkoutPeriod=month&checkoutConsent=1',
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

  it('does not resume checkout when the renewal checkbox was not ticked before sign-in', async () => {
    window.history.replaceState(
      {},
      '',
      '/pricing?checkoutPlan=plan_starter&checkoutPeriod=month',
    );
    mocks.getPlans.mockResolvedValue({ data: [STARTER_PLAN] });

    await renderPricingTable();

    const checkbox = await screen.findByRole('checkbox', {
      name: /automatic monthly renewal/i,
    });
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(checkbox).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Begin with Starter' }),
    ).toBeDisabled();
    expect(mocks.openCheckout).not.toHaveBeenCalled();
  });

  describe('automatic renewal disclosure and consent', () => {
    it('discloses the plan price and renewal terms above a disabled checkout until the visitor agrees', async () => {
      mocks.getPlans.mockResolvedValue({
        data: [
          {
            ...STARTER_PLAN,
            fee: { amount: 2500, amountFormatted: '25.00', currency: 'USD' },
          },
        ],
      });
      const user = userEvent.setup();

      await renderPricingTable();

      const card = await screen.findByRole('article', { name: 'Starter' });
      expect(
        within(card).getByText(
          /\$25 USD billed monthly\. Renews automatically every month until you cancel\. Cancel anytime in Settings → Billing; cancellation takes effect at the end of the billing period\. No refunds\./,
        ),
      ).toBeVisible();
      for (const link of within(card).getAllByRole('link', {
        name: 'Terms of Service',
      })) {
        expect(link).toHaveAttribute('href', '/terms');
      }

      const checkbox = within(card).getByRole('checkbox', {
        name: /I agree to automatic monthly renewal and the Terms of Service/,
      });
      const button = within(card).getByRole('button', {
        name: 'Begin with Starter',
      });
      expect(checkbox).not.toBeChecked();
      expect(checkbox).toBeRequired();
      expect(checkbox).toHaveAccessibleDescription(/\$25 USD billed monthly/);
      expect(button).toBeDisabled();

      await user.click(button);
      expect(mocks.openCheckout).not.toHaveBeenCalled();

      await user.click(checkbox);
      expect(button).toBeEnabled();
      await user.click(button);
      expect(mocks.openCheckout).toHaveBeenCalledWith('plan_starter', 'month');

      await user.click(checkbox);
      expect(button).toBeDisabled();
    });

    it('toggles the checkbox from the keyboard and tracks consent per plan', async () => {
      mocks.getPlans.mockResolvedValue({ data: [STARTER_PLAN, PRO_PLAN] });
      const user = userEvent.setup();

      await renderPricingTable();

      const starter = await screen.findByRole('article', { name: 'Starter' });
      const pro = screen.getByRole('article', { name: 'Pro' });
      const starterCheckbox = within(starter).getByRole('checkbox');
      starterCheckbox.focus();
      await user.keyboard(' ');

      expect(starterCheckbox).toBeChecked();
      expect(
        within(starter).getByRole('button', { name: 'Begin with Starter' }),
      ).toBeEnabled();
      expect(within(pro).getByRole('checkbox')).not.toBeChecked();
      expect(
        within(pro).getByRole('button', { name: 'Begin with Pro' }),
      ).toBeDisabled();
    });

    it('describes annual billing and resets consent when the period changes', async () => {
      mocks.getPlans.mockResolvedValue({ data: [STARTER_PLAN] });
      const user = userEvent.setup();

      await renderPricingTable();

      await user.click(await screen.findByRole('checkbox'));
      await user.click(screen.getByRole('button', { name: 'Yearly' }));

      const card = screen.getByRole('article', { name: 'Starter' });
      expect(
        within(card).getByText(
          /\$96 USD billed yearly\. Renews automatically every year until you cancel\./,
        ),
      ).toBeVisible();
      expect(
        within(card).getByRole('checkbox', {
          name: /automatic yearly renewal/,
        }),
      ).not.toBeChecked();
      expect(
        within(card).getByRole('button', { name: 'Begin with Starter' }),
      ).toBeDisabled();
    });

    it('gates the signed-out sign-up path and keeps consent through the sign-in redirect', async () => {
      mocks.useAuth.mockReturnValue({ isLoaded: true, userId: null });
      mocks.getPlans.mockResolvedValue({ data: [STARTER_PLAN] });
      const user = userEvent.setup();

      await renderPricingTable();

      const button = await screen.findByRole('button', {
        name: 'Begin with Starter',
      });
      expect(
        screen.getByText(/billed monthly\. Renews automatically/),
      ).toBeVisible();
      expect(button).toBeDisabled();

      await user.click(screen.getByRole('checkbox'));

      expect(button).toBeEnabled();
      expect(screen.getByTestId('sign-in-checkout')).toHaveAttribute(
        'data-redirect',
        '/pricing?checkoutPlan=plan_starter&checkoutPlanSlug=starter_plan&checkoutPeriod=month&checkoutConsent=1',
      );
    });

    it('omits consent from the free plan, the current plan, and the closed-app links', async () => {
      mocks.getSubscription.mockResolvedValue({
        subscriptionItems: [
          {
            plan: { hasBaseFee: true, slug: 'starter_plan' },
            status: 'active',
          },
        ],
      });
      mocks.getPlans.mockResolvedValue({
        data: [FREE_PLAN, { ...STARTER_PLAN, annualFee: null }],
      });

      await renderPricingTable();

      expect(
        await screen.findByRole('button', { name: 'Manage subscription' }),
      ).toBeEnabled();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(
        screen.queryByText(/renews automatically/i),
      ).not.toBeInTheDocument();
    });

    it('does not show renewal consent when the app is closed', async () => {
      mocks.getPlans.mockResolvedValue({ data: [FREE_PLAN, STARTER_PLAN] });

      await renderPricingTable({ appClosed: true });

      await screen.findByRole('link', { name: 'Begin with Starter' });
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });
  });

  describe('when signed in', () => {
    const subscribedTo = (slug: string) => ({
      subscriptionItems: [
        { plan: { hasBaseFee: true, slug }, status: 'active' },
      ],
    });

    const expectCard = (
      name: string,
      expected: {
        action: string | RegExp;
        current: boolean;
        featured: boolean;
      },
    ) => {
      const card = screen.getByRole('article', { name });
      expect(within(card).getByText(expected.action)).toBeVisible();
      if (expected.current) {
        expect(within(card).getByText('Current plan')).toBeVisible();
      } else {
        expect(
          within(card).queryByText('Current plan'),
        ).not.toBeInTheDocument();
      }
      if (expected.featured) {
        expect(card).toHaveAttribute('data-featured', 'true');
      } else {
        expect(card).not.toHaveAttribute('data-featured');
      }
    };

    beforeEach(() => {
      mocks.getPlans.mockResolvedValue({
        data: [FREE_PLAN, STARTER_PLAN, PRO_PLAN],
      });
    });

    it('offers a Pro user their own plan to manage and Starter to switch to', async () => {
      mocks.getSubscription.mockResolvedValue(subscribedTo('pro_plan'));
      const user = userEvent.setup();

      await renderPricingTable();

      await screen.findByRole('article', { name: 'Pro' });
      expectCard('Free', {
        action: "You're on Pro",
        current: false,
        featured: false,
      });
      expectCard('Starter', {
        action: 'Switch to Starter',
        current: false,
        featured: false,
      });
      expectCard('Pro', {
        action: 'Manage subscription',
        current: true,
        featured: true,
      });
      expect(
        screen.getAllByRole('button', { name: /subscription/i }),
      ).toHaveLength(1);

      await user.click(
        screen.getByRole('button', { name: 'Manage subscription' }),
      );
      expect(mocks.openSubscription).toHaveBeenCalledTimes(1);
    });

    describe('moving from Pro to Starter', () => {
      const proUntil = new Date(2026, 10, 23, 12);
      const heldPro = (overrides: object = {}) => ({
        plan: { hasBaseFee: true, name: 'Pro', slug: 'pro_plan' },
        periodEnd: proUntil,
        planPeriod: 'month',
        status: 'active',
        ...overrides,
      });
      const upcomingStarter = {
        plan: { hasBaseFee: true, name: 'Starter', slug: 'starter_plan' },
        periodStart: proUntil,
        status: 'upcoming',
      };
      const upcomingFree = {
        plan: { hasBaseFee: false, name: 'Free', slug: 'free_user' },
        status: 'upcoming',
      };

      it('requires renewal consent, says when it starts, and skips the webhook wait', async () => {
        mocks.getSubscription.mockResolvedValue({
          subscriptionItems: [heldPro()],
        });
        const user = userEvent.setup();

        await renderPricingTable();

        const starter = await screen.findByRole('article', { name: 'Starter' });
        expect(
          within(starter).getByText(
            'You keep Pro until Nov 23, then move to Starter. No charge today.',
          ),
        ).toBeVisible();
        const button = within(starter).getByRole('button', {
          name: 'Switch to Starter',
        });
        expect(button).toBeDisabled();

        await user.click(within(starter).getByRole('checkbox'));
        await user.click(button);

        expect(mocks.openCheckout).toHaveBeenCalledWith(
          'plan_starter',
          'month',
        );
        expect(screen.getByTestId('checkout-plan_starter')).toHaveAttribute(
          'data-redirect',
          '/settings/billing',
        );
      });

      it.each([
        { label: 'past due', item: { status: 'past_due' } },
        { label: 'on a free trial', item: { isFreeTrial: true } },
      ])('offers no switch while Pro is $label', async ({ item }) => {
        mocks.getSubscription.mockResolvedValue({
          subscriptionItems: [heldPro(item)],
        });

        await renderPricingTable();

        const starter = await screen.findByRole('article', { name: 'Starter' });
        expect(within(starter).getByText("You're on Pro")).toBeVisible();
        expect(
          screen.queryByTestId('checkout-plan_starter'),
        ).not.toBeInTheDocument();
      });

      it.each([
        { label: 'canceledAt', item: { canceledAt: new Date() } },
        { label: 'canceled status', item: { status: 'canceled' } },
      ])(
        'shows the scheduled start on Starter and offers Keep Pro: $label',
        async ({ item }) => {
          mocks.getSubscription.mockResolvedValue({
            subscriptionItems: [heldPro(item), upcomingStarter],
          });
          const user = userEvent.setup();

          await renderPricingTable();

          const starter = await screen.findByRole('article', {
            name: 'Starter',
          });
          expect(
            within(starter).getByText(
              "Starts Nov 23. You're on Pro until then.",
            ),
          ).toBeVisible();
          expect(
            screen.queryByTestId('checkout-plan_starter'),
          ).not.toBeInTheDocument();

          const pro = screen.getByRole('article', { name: 'Pro' });
          expect(within(pro).getByText('Current plan')).toBeVisible();
          expect(
            within(pro).getByText('Moves to Starter on Nov 23.'),
          ).toBeVisible();
          const keep = within(pro).getByRole('button', { name: 'Keep Pro' });
          expect(keep).toBeDisabled();

          await user.click(within(pro).getByRole('checkbox'));
          await user.click(keep);

          expect(mocks.openCheckout).toHaveBeenCalledWith('plan_pro', 'month');
          expect(screen.getByTestId('checkout-plan_pro')).toHaveAttribute(
            'data-redirect',
            '/settings/billing',
          );
        },
      );

      it('offers Keep Pro if Clerk leaves Pro with no cancel marker', async () => {
        mocks.getSubscription.mockResolvedValue({
          subscriptionItems: [heldPro(), upcomingStarter],
        });

        await renderPricingTable();

        const pro = await screen.findByRole('article', { name: 'Pro' });
        expect(
          within(pro).getByText('Moves to Starter on Nov 23.'),
        ).toBeVisible();
        expect(
          within(pro).getByRole('button', { name: 'Keep Pro' }),
        ).toBeVisible();
        expect(
          within(pro).queryByRole('button', { name: 'Manage subscription' }),
        ).not.toBeInTheDocument();
      });

      it('offers Keep Pro and Starter after canceling to Free', async () => {
        mocks.getSubscription.mockResolvedValue({
          subscriptionItems: [
            heldPro({ canceledAt: new Date() }),
            upcomingFree,
          ],
        });

        await renderPricingTable();

        const pro = await screen.findByRole('article', { name: 'Pro' });
        expect(within(pro).getByText('Access ends Nov 23.')).toBeVisible();
        expect(
          within(pro).getByRole('button', { name: 'Keep Pro' }),
        ).toBeVisible();
        expectCard('Free', {
          action: "You're on Pro",
          current: false,
          featured: false,
        });
        expectCard('Starter', {
          action: 'Switch to Starter',
          current: false,
          featured: false,
        });
      });

      it('uses the live plan when an upgraded plan still lists as canceled', async () => {
        mocks.getSubscription.mockResolvedValue({
          subscriptionItems: [
            {
              plan: { hasBaseFee: true, name: 'Starter', slug: 'starter_plan' },
              periodEnd: proUntil,
              status: 'canceled',
            },
            heldPro(),
          ],
        });

        await renderPricingTable();

        await screen.findByRole('article', { name: 'Pro' });
        expectCard('Pro', {
          action: 'Manage subscription',
          current: true,
          featured: true,
        });
      });

      it('offers no switch across billing periods, since Clerk may charge now', async () => {
        mocks.getSubscription.mockResolvedValue({
          subscriptionItems: [heldPro({ planPeriod: 'annual' })],
        });

        await renderPricingTable();

        const starter = await screen.findByRole('article', { name: 'Starter' });
        expect(
          within(starter).getByText(
            "You're on Pro. Choose Yearly above to switch.",
          ),
        ).toBeVisible();
        expect(
          screen.queryByTestId('checkout-plan_starter'),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/No charge today/)).not.toBeInTheDocument();
      });

      it('keeps the held billing period when keeping Pro on the other toggle', async () => {
        mocks.getSubscription.mockResolvedValue({
          subscriptionItems: [
            heldPro({ canceledAt: new Date(), planPeriod: 'annual' }),
          ],
        });

        await renderPricingTable();

        await screen.findByRole('article', { name: 'Pro' });
        expect(screen.getByTestId('checkout-plan_pro')).toHaveAttribute(
          'data-period',
          'annual',
        );
      });
    });

    it('offers a Starter user an upgrade to Pro and emphasizes it', async () => {
      mocks.getSubscription.mockResolvedValue(subscribedTo('starter_plan'));

      await renderPricingTable();

      await screen.findByRole('article', { name: 'Pro' });
      expectCard('Free', {
        action: "You're on Starter",
        current: false,
        featured: false,
      });
      expectCard('Starter', {
        action: 'Manage subscription',
        current: true,
        featured: false,
      });
      expectCard('Pro', {
        action: 'Upgrade to Pro',
        current: false,
        featured: true,
      });
      expect(screen.getByTestId('checkout-plan_pro')).toBeVisible();
    });

    it('marks Free as the current plan for a user with no paid subscription', async () => {
      await renderPricingTable();

      await screen.findByRole('article', { name: 'Pro' });
      expectCard('Free', {
        action: 'Create a plan',
        current: true,
        featured: false,
      });
      expect(
        within(screen.getByRole('article', { name: 'Free' })).getByRole(
          'link',
          { name: 'Create a plan' },
        ),
      ).toHaveAttribute('href', '/plans/new');
      expectCard('Starter', {
        action: 'Begin with Starter',
        current: false,
        featured: true,
      });
      expectCard('Pro', {
        action: 'Begin with Pro',
        current: false,
        featured: false,
      });
    });

    it('offers no upgrade from a paid plan it cannot rank', async () => {
      mocks.getSubscription.mockResolvedValue(subscribedTo('legacy_plan'));

      await renderPricingTable();

      await screen.findByRole('article', { name: 'Pro' });
      expectCard('Free', {
        action: 'Create a plan',
        current: false,
        featured: false,
      });
      expectCard('Starter', {
        action: 'Begin with Starter',
        current: false,
        featured: false,
      });
      expectCard('Pro', {
        action: 'Begin with Pro',
        current: false,
        featured: false,
      });
    });

    it('keeps a past-due subscriber on their plan', async () => {
      mocks.getSubscription.mockResolvedValue({
        subscriptionItems: [
          {
            plan: { hasBaseFee: true, slug: 'starter_plan' },
            status: 'past_due',
          },
        ],
      });

      await renderPricingTable();

      await screen.findByRole('article', { name: 'Starter' });
      expectCard('Starter', {
        action: 'Manage subscription',
        current: true,
        featured: false,
      });
    });

    it('drops a resumed checkout for a plan below the one they hold', async () => {
      window.history.replaceState(
        {},
        '',
        '/pricing?checkoutPlan=plan_starter&checkoutPeriod=month&checkoutConsent=1',
      );
      mocks.getSubscription.mockResolvedValue(subscribedTo('pro_plan'));

      await renderPricingTable();

      await screen.findByRole('article', { name: 'Starter' });
      await waitFor(() => expect(window.location.search).toBe(''));
      expect(mocks.openCheckout).not.toHaveBeenCalled();
      expect(mocks.openSubscription).not.toHaveBeenCalled();
    });

    it('resumes a checkout for a plan above the one they hold', async () => {
      window.history.replaceState(
        {},
        '',
        '/pricing?checkoutPlan=plan_pro&checkoutPeriod=month&checkoutConsent=1',
      );
      mocks.getSubscription.mockResolvedValue(subscribedTo('starter_plan'));

      await renderPricingTable();

      await waitFor(() =>
        expect(mocks.openCheckout).toHaveBeenCalledWith('plan_pro', 'month'),
      );
      expect(window.location.search).toBe('');
    });

    it('shows no viewer state while the app is closed', async () => {
      mocks.getSubscription.mockResolvedValue(subscribedTo('pro_plan'));

      await renderPricingTable({ appClosed: true });

      await screen.findByRole('article', { name: 'Pro' });
      expectCard('Starter', {
        action: 'Begin with Starter',
        current: false,
        featured: true,
      });
      expectCard('Pro', {
        action: 'Begin with Pro',
        current: false,
        featured: false,
      });
    });
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

  it('hides the billing period toggle when no plan has an annual price', async () => {
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
      await screen.findByRole('article', { name: 'Starter' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('group', { name: 'Billing period' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /yearly/i }),
    ).not.toBeInTheDocument();
  });

  it('shows a retryable error when plan loading fails and recovers without export copy', async () => {
    window.history.replaceState(
      {},
      '',
      '/pricing?checkoutPlan=plan_starter&checkoutPeriod=annual',
    );
    mocks.getPlans.mockRejectedValueOnce(new Error('network unavailable'));
    const user = userEvent.setup();

    await renderPricingTable();

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(
      screen.queryByTestId('native-pricing-table'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/\bexports?\b/i)).not.toBeInTheDocument();
    expect(window.location.search).toBe('');

    mocks.getPlans.mockResolvedValue({
      data: [
        {
          ...STARTER_PLAN,
          features: [
            { name: '10 active learning plans' },
            { name: '50 exports per month' },
            { name: 'Priority queue access' },
          ],
        },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('10 active plans')).toBeVisible();
    expect(screen.queryByText('Priority queue access')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('native-pricing-table'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/\bexports?\b/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('checkout-plan_starter')).toBeVisible();
  });

  it('clears loading placeholders after Clerk returns an empty plan list', async () => {
    mocks.getPlans.mockResolvedValue({ data: [] });

    await renderPricingTable();

    await waitFor(() => expect(mocks.getPlans).toHaveBeenCalled());
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(document.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('compares plans from tier limits, not from Clerk feature strings', async () => {
    mocks.getPlans.mockResolvedValue({
      data: [
        {
          ...FREE_PLAN,
          name: 'Free',
          features: [
            { name: '10 active learning plans' },
            { name: '50 exports per month' },
          ],
        },
        { ...STARTER_PLAN, features: [{ name: 'Priority queue access' }] },
      ],
    });

    await renderPricingTable();

    const comparison = await screen.findByRole('region', {
      name: 'Plan comparison',
    });
    expect(comparison).toHaveAttribute('tabindex', '0');
    const plansIncluded = within(comparison).getByRole('row', {
      name: /plans included/i,
    });
    expect(
      within(plansIncluded)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['1', '10 at a time']);
    expect(
      within(comparison).queryByText(/exports?|priority queue/i),
    ).not.toBeInTheDocument();
  });

  it('labels each comparison column with its plan name and price for the selected period', async () => {
    mocks.getPlans.mockResolvedValue({
      data: [FREE_PLAN, STARTER_PLAN, PRO_PLAN],
    });
    const user = userEvent.setup();

    await renderPricingTable();

    const comparison = await screen.findByRole('region', {
      name: 'Plan comparison',
    });
    const headerText = () =>
      within(comparison)
        .getAllByRole('columnheader')
        .map((header) => header.textContent);
    expect(headerText()).toEqual([
      'Feature',
      'Free$0',
      'Starter$10 per month',
      'Pro$20 per month',
    ]);

    await user.click(screen.getByRole('button', { name: 'Yearly' }));

    expect(headerText()).toEqual([
      'Feature',
      'Free$0',
      'Starter$8 per month',
      'Pro$16 per month',
    ]);
  });

  it('shows placeholder cards while Clerk plans are loading', async () => {
    let resolvePlans!: (value: { data: (typeof STARTER_PLAN)[] }) => void;
    mocks.getPlans.mockReturnValue(
      new Promise((resolve) => {
        resolvePlans = resolve;
      }),
    );

    await renderPricingTable();

    const table = document.querySelector('[aria-busy="true"]');
    expect(table).not.toBeNull();
    expect(table?.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);

    resolvePlans({ data: [STARTER_PLAN] });
    expect(
      await screen.findByRole('article', { name: 'Starter' }),
    ).toBeVisible();
  });

  it('renders the monthly fee from Clerk plan data', async () => {
    mocks.getPlans.mockResolvedValue({ data: [STARTER_PLAN] });

    await renderPricingTable();

    expect(await screen.findByText('$10')).toBeVisible();
  });
});
