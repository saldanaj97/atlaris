import { PricingGrid } from '@/app/(marketing)/pricing/components/PricingGrid';
import type { StripeTierConfig } from '@/app/(marketing)/pricing/components/pricing-config';
import type { BillingCatalogTierData } from '@/features/billing/catalog-read';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(marketing)/pricing/components/SubscribeButton', () => ({
  default: ({ priceId, label }: { priceId: string; label: string }) => (
    <button type="button" data-testid={`subscribe-${priceId}`}>
      {label}
    </button>
  ),
}));

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
  const configs: StripeTierConfig[] = [
    { key: 'free' },
    { key: 'starter', priceId: 'price_starter_monthly' },
    { key: 'pro', priceId: 'price_pro_monthly' },
  ];

  const stripeData = new Map<SubscriptionTier, BillingCatalogTierData>([
    ['free', { name: 'Free', amount: '$0' }],
    ['starter', { name: 'Starter', amount: '$9' }],
    ['pro', { name: 'Pro', amount: '$29' }],
  ]);

  it('should render SubscribeButton for paid tiers', () => {
    render(
      <PricingGrid
        configs={configs}
        intervalLabel="/month"
        tierDisplayMap={stripeData}
        subscribeLabel="Get Started"
      />,
    );

    expect(
      screen.getByTestId('subscribe-price_starter_monthly'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('subscribe-price_pro_monthly'),
    ).toBeInTheDocument();
  });

  it('should render Link for free tier', () => {
    render(
      <PricingGrid
        configs={configs}
        intervalLabel="/month"
        tierDisplayMap={stripeData}
        subscribeLabel="Subscribe"
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Get started free' }),
    ).toHaveAttribute('href', '/plans/new');
  });

  it('should handle empty stripe data gracefully', () => {
    render(
      <PricingGrid
        configs={configs}
        intervalLabel="/month"
        tierDisplayMap={new Map<SubscriptionTier, BillingCatalogTierData>()}
        subscribeLabel="Subscribe"
      />,
    );

    expect(screen.getAllByText('Free').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
  });

  it('should render single tier when only one config provided', () => {
    render(
      <PricingGrid
        configs={[{ key: 'starter', priceId: 'price_starter_monthly' }]}
        intervalLabel="/month"
        tierDisplayMap={stripeData}
        subscribeLabel="Subscribe"
      />,
    );

    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.queryByText('Pro')).not.toBeInTheDocument();
  });

  it('should disable the CTA when a paid tier is missing its priceId', () => {
    render(
      <PricingGrid
        configs={[{ key: 'starter' }]}
        intervalLabel="/month"
        tierDisplayMap={stripeData}
        subscribeLabel="Subscribe"
      />,
    );

    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
  });

  it('should not render SubscribeButton when a paid tier priceId is empty', () => {
    render(
      <PricingGrid
        configs={[{ key: 'starter', priceId: '' }]}
        intervalLabel="/month"
        tierDisplayMap={stripeData}
        subscribeLabel="Subscribe"
      />,
    );

    expect(screen.queryByTestId('subscribe-')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
  });

  it('should fall back to default price when Stripe data is missing', () => {
    render(
      <PricingGrid
        configs={configs}
        intervalLabel="/month"
        tierDisplayMap={
          new Map<SubscriptionTier, BillingCatalogTierData>([
            ['free', { name: 'Free', amount: '$0' }],
          ])
        }
        subscribeLabel="Subscribe"
      />,
    );

    expect(screen.getAllByText(/\$—/).length).toBeGreaterThanOrEqual(2);
  });
});
