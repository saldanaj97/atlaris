import type { TierConfig } from '@/components/billing/pricing-config';
import { PricingGrid } from '@/components/billing/PricingGrid';
import type { TierKey } from '@/components/billing/PricingTiers';
import type { StripeTierData } from '@/components/billing/stripe-pricing';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

// Mock SubscribeButton
vi.mock('@/components/billing/SubscribeButton', () => ({
  default: ({ priceId, label }: { priceId: string; label: string }) => (
    <button data-testid={`subscribe-${priceId}`}>{label}</button>
  ),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

describe('PricingGrid', () => {
  const mockConfigs: TierConfig[] = [
    {
      key: 'free' as TierKey,
      priceId: null,
      badgeVariant: 'secondary',
    },
    {
      key: 'starter' as TierKey,
      priceId: 'price_starter_monthly',
      badgeVariant: 'default',
    },
    {
      key: 'pro' as TierKey,
      priceId: 'price_pro_monthly',
      badgeVariant: 'default',
    },
  ];

  const mockStripeData = new Map<TierKey, StripeTierData>([
    ['free', { name: 'Free', amount: '$0' }],
    ['starter', { name: 'Starter', amount: '$9' }],
    ['pro', { name: 'Pro', amount: '$29' }],
  ]);

  it('should render all pricing tiers', () => {
    render(
      <PricingGrid
        configs={mockConfigs}
        intervalLabel="/month"
        stripeData={mockStripeData}
        subscribeLabel="Subscribe"
      />
    );

    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
  });

  it('should display prices from Stripe data', () => {
    render(
      <PricingGrid
        configs={mockConfigs}
        intervalLabel="/month"
        stripeData={mockStripeData}
        subscribeLabel="Subscribe"
      />
    );

    expect(screen.getByText(/\$0/)).toBeInTheDocument();
    expect(screen.getByText(/\$9/)).toBeInTheDocument();
    expect(screen.getByText(/\$29/)).toBeInTheDocument();
  });

  it('should display interval label with prices', () => {
    render(
      <PricingGrid
        configs={mockConfigs}
        intervalLabel="/month"
        stripeData={mockStripeData}
        subscribeLabel="Subscribe"
      />
    );

    // All prices should be followed by interval label
    const monthLabels = screen.getAllByText(/\/month/);
    expect(monthLabels.length).toBeGreaterThanOrEqual(3);
  });

  it('should render SubscribeButton for paid tiers', () => {
    render(
      <PricingGrid
        configs={mockConfigs}
        intervalLabel="/month"
        stripeData={mockStripeData}
        subscribeLabel="Get Started"
      />
    );

    // Should have SubscribeButtons for starter and pro
    expect(
      screen.getByTestId('subscribe-price_starter_monthly')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('subscribe-price_pro_monthly')
    ).toBeInTheDocument();
    const buttons = screen.getAllByText('Get Started');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('should render Link for free tier', () => {
    render(
      <PricingGrid
        configs={mockConfigs}
        intervalLabel="/month"
        stripeData={mockStripeData}
        subscribeLabel="Subscribe"
      />
    );

    // Free tier should have a link to dashboard
    expect(screen.getByText('Continue Free')).toBeInTheDocument();
  });

  it('should display tier features', () => {
    render(
      <PricingGrid
        configs={mockConfigs}
        intervalLabel="/month"
        stripeData={mockStripeData}
        subscribeLabel="Subscribe"
      />
    );

    // Check for some expected features (across multiple tiers)
    expect(screen.getAllByText(/active plans/).length).toBeGreaterThanOrEqual(
      1
    );
    expect(
      screen.getAllByText(/regenerations per month/).length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/exports per month/).length
    ).toBeGreaterThanOrEqual(1);
  });

  it('should use grid layout', () => {
    const { container } = render(
      <PricingGrid
        configs={mockConfigs}
        intervalLabel="/month"
        stripeData={mockStripeData}
        subscribeLabel="Subscribe"
      />
    );

    const grid = container.querySelector('.grid');
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveClass('gap-6');
    expect(grid).toHaveClass('md:grid-cols-3');
  });

  it('should render correct number of cards', () => {
    const { container } = render(
      <PricingGrid
        configs={mockConfigs}
        intervalLabel="/month"
        stripeData={mockStripeData}
        subscribeLabel="Subscribe"
      />
    );

    // Should have at least 3 pricing cards
    const cards = container.querySelectorAll('[data-slot="card"]');
    expect(cards.length).toBeGreaterThanOrEqual(3);
  });

  it('should handle empty stripe data gracefully', () => {
    const emptyStripeData = new Map<TierKey, StripeTierData>();

    render(
      <PricingGrid
        configs={mockConfigs}
        intervalLabel="/month"
        stripeData={emptyStripeData}
        subscribeLabel="Subscribe"
      />
    );

    // Should still render tier names from defaults
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
  });

  it('should render single tier when only one config provided', () => {
    const singleConfig: TierConfig[] = [
      {
        key: 'starter' as TierKey,
        priceId: 'price_starter_monthly',
        badgeVariant: 'default',
      },
    ];

    render(
      <PricingGrid
        configs={singleConfig}
        intervalLabel="/month"
        stripeData={mockStripeData}
        subscribeLabel="Subscribe"
      />
    );

    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.queryByText('Free')).not.toBeInTheDocument();
    expect(screen.queryByText('Pro')).not.toBeInTheDocument();
  });

  it('should pass custom subscribe label to buttons', () => {
    render(
      <PricingGrid
        configs={mockConfigs}
        intervalLabel="/month"
        stripeData={mockStripeData}
        subscribeLabel="Upgrade Now"
      />
    );

    expect(screen.getAllByText('Upgrade Now').length).toBeGreaterThanOrEqual(2);
  });

  it('should use custom interval label', () => {
    render(
      <PricingGrid
        configs={mockConfigs}
        intervalLabel="/year"
        stripeData={mockStripeData}
        subscribeLabel="Subscribe"
      />
    );

    const yearLabels = screen.getAllByText(/\/year/);
    expect(yearLabels.length).toBeGreaterThanOrEqual(3);
  });

  it('should display badges for tiers', () => {
    render(
      <PricingGrid
        configs={mockConfigs}
        intervalLabel="/month"
        stripeData={mockStripeData}
        subscribeLabel="Subscribe"
      />
    );

    // Check for tier badges
    expect(screen.getByText('Current')).toBeInTheDocument(); // Free tier
    expect(screen.getByText('Popular')).toBeInTheDocument(); // Starter tier
    expect(screen.getByText('Best')).toBeInTheDocument(); // Pro tier
  });

  it('should handle missing priceId for free tier', () => {
    render(
      <PricingGrid
        configs={mockConfigs}
        intervalLabel="/month"
        stripeData={mockStripeData}
        subscribeLabel="Subscribe"
      />
    );

    // Free tier should not have a SubscribeButton
    expect(screen.queryByTestId('subscribe-null')).not.toBeInTheDocument();
    // But should have the Continue Free link
    expect(screen.getByText('Continue Free')).toBeInTheDocument();
  });

  it('should fall back to default price when Stripe data is missing', () => {
    const partialStripeData = new Map<TierKey, StripeTierData>([
      ['free', { name: 'Free', amount: '$0' }],
      // Missing starter and pro
    ]);

    render(
      <PricingGrid
        configs={mockConfigs}
        intervalLabel="/month"
        stripeData={partialStripeData}
        subscribeLabel="Subscribe"
      />
    );

    // Should show fallback price symbol
    expect(screen.getAllByText(/\$—/).length).toBeGreaterThanOrEqual(2);
  });
});
