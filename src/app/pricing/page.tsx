import SubscribeButton from '@/components/billing/SubscribeButton';
import ManageSubscriptionButton from '@/components/billing/ManageSubscriptionButton';
import { TIER_LIMITS } from '@/lib/stripe/tier-limits';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Link from 'next/link';
import { getStripe } from '@/lib/stripe/client';

function getEnv(name: string) {
  return process.env[name];
}

function formatAmount(cents?: number | null, currency: string = 'USD') {
  if (cents == null) return '—';
  const amount = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Define UI-friendly mapping from TIER_LIMITS to avoid drift
const PRICING_TIERS = {
  free: {
    name: 'Free',
    price: '$0',
    features: [
      `${TIER_LIMITS.free.maxActivePlans} active plans`,
      `${TIER_LIMITS.free.monthlyRegenerations} regenerations per month`,
      `${TIER_LIMITS.free.monthlyExports} exports per month`,
    ],
    button: <Link href="/dashboard">Continue Free</Link>,
    variant: 'secondary' as const,
    badge: 'Current',
  },
  starter: {
    name: 'Starter',
    price: null, // Dynamic from Stripe
    features: [
      `${TIER_LIMITS.starter.maxActivePlans} active plans`,
      `${TIER_LIMITS.starter.monthlyRegenerations} regenerations per month`,
      `${TIER_LIMITS.starter.monthlyExports} exports per month`,
      'Priority topics and faster queue',
    ],
    button: null, // Dynamic SubscribeButtons
    variant: 'default' as const,
    badge: 'Popular',
    recommended: true,
  },
  pro: {
    name: 'Pro',
    price: null, // Dynamic from Stripe
    features: [
      'Unlimited active plans',
      `${TIER_LIMITS.pro.monthlyRegenerations} regenerations per month`,
      'Unlimited exports',
      'Priority topics and faster queue + analytics',
    ],
    button: null, // Dynamic SubscribeButtons
    variant: 'default' as const,
    badge: 'Best',
  },
} as const;

export default async function PricingPage() {
  const starterMonthly = getEnv('STRIPE_STARTER_MONTHLY_PRICE_ID');
  const starterYearly = getEnv('STRIPE_STARTER_YEARLY_PRICE_ID');
  const proMonthly = getEnv('STRIPE_PRO_MONTHLY_PRICE_ID');
  const proYearly = getEnv('STRIPE_PRO_YEARLY_PRICE_ID');

  const missingPrices =
    !starterMonthly || !starterYearly || !proMonthly || !proYearly;

  let starterName: string = PRICING_TIERS.starter.name;
  let starterMonthlyAmount = '$—';
  let proName: string = PRICING_TIERS.pro.name;
  let proMonthlyAmount = '$—';

  if (starterMonthly && starterYearly && proMonthly && proYearly) {
    const stripe = getStripe();
    const [starterMonthlyPrice, proMonthlyPrice] = await Promise.all([
      stripe.prices.retrieve(starterMonthly),
      stripe.prices.retrieve(proMonthly),
    ]);

    // Expand products individually to safely access product names across API versions
    const [starterProduct, proProduct] = await Promise.all([
      typeof starterMonthlyPrice.product === 'string'
        ? stripe.products.retrieve(starterMonthlyPrice.product)
        : Promise.resolve(starterMonthlyPrice.product),
      typeof proMonthlyPrice.product === 'string'
        ? stripe.products.retrieve(proMonthlyPrice.product)
        : Promise.resolve(proMonthlyPrice.product),
    ]);

    starterName =
      (starterProduct && 'name' in starterProduct && starterProduct.name) ||
      PRICING_TIERS.starter.name;
    proName =
      (proProduct && 'name' in proProduct && proProduct.name) ||
      PRICING_TIERS.pro.name;

    starterMonthlyAmount = formatAmount(
      starterMonthlyPrice.unit_amount,
      starterMonthlyPrice.currency?.toUpperCase()
    );
    proMonthlyAmount = formatAmount(
      proMonthlyPrice.unit_amount,
      proMonthlyPrice.currency?.toUpperCase()
    );
  }

  return (
    <div className="bg-gradient-subtle min-h-screen">
      <div className="container mx-auto px-6 py-12">
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-4xl font-bold">Choose your plan</h1>
          <p className="text-muted-foreground">
            Upgrade for more capacity and features.
          </p>
        </div>

        {missingPrices ? (
          <Card className="border-destructive/30 bg-destructive/5 text-destructive mx-auto mb-8 max-w-3xl border p-4 text-sm">
            Stripe price IDs are not configured. Set STRIPE_*_PRICE_ID env vars.
          </Card>
        ) : null}

        <div className="grid gap-6 md:grid-cols-3">
          {/* Free Tier */}
          <Card className="bg-gradient-card border-0 p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {PRICING_TIERS.free.name}
              </h2>
              <Badge variant={PRICING_TIERS.free.variant}>
                {PRICING_TIERS.free.badge}
              </Badge>
            </div>
            <p className="mb-4 text-3xl font-bold">
              {PRICING_TIERS.free.price}
            </p>
            <ul className="text-muted-foreground mb-6 space-y-2 text-sm">
              {PRICING_TIERS.free.features.map((feature, idx) => (
                <li key={idx}>{feature}</li>
              ))}
            </ul>
            <Button
              asChild
              variant={PRICING_TIERS.free.variant}
              className="w-full"
            >
              {PRICING_TIERS.free.button}
            </Button>
          </Card>

          {/* Starter Tier - Recommended */}
          <Card
            className={`bg-gradient-card relative p-6 shadow-sm ${PRICING_TIERS.starter.recommended ? 'border-primary/50 ring-primary/20 ring-2' : ''}`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{starterName}</h2>
              <Badge variant="default">{PRICING_TIERS.starter.badge}</Badge>
            </div>
            <p className="mb-1 text-3xl font-bold">{starterMonthlyAmount}</p>
            <p className="text-muted-foreground mb-4 text-sm">per month</p>
            <ul className="text-muted-foreground mb-6 space-y-2 text-sm">
              {PRICING_TIERS.starter.features.map((feature, idx) => (
                <li key={idx}>{feature}</li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-3">
              <SubscribeButton
                priceId={starterMonthly ?? ''}
                label="Subscribe Monthly"
                className="w-full"
              />
              <SubscribeButton
                priceId={starterYearly ?? ''}
                label="Subscribe Yearly"
                className="w-full"
              />
            </div>
            {PRICING_TIERS.starter.recommended && (
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-1/2 transform">
                <div className="bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs font-bold">
                  Most Popular
                </div>
              </div>
            )}
          </Card>

          {/* Pro Tier */}
          <Card className="bg-gradient-card border-0 p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{proName}</h2>
              <Badge variant="outline">{PRICING_TIERS.pro.badge}</Badge>
            </div>
            <p className="mb-1 text-3xl font-bold">{proMonthlyAmount}</p>
            <p className="text-muted-foreground mb-4 text-sm">per month</p>
            <ul className="text-muted-foreground mb-6 space-y-2 text-sm">
              {PRICING_TIERS.pro.features.map((feature, idx) => (
                <li key={idx}>{feature}</li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-3">
              <SubscribeButton
                priceId={proMonthly ?? ''}
                label="Subscribe Monthly"
                className="w-full"
              />
              <SubscribeButton
                priceId={proYearly ?? ''}
                label="Subscribe Yearly"
                className="w-full"
              />
            </div>
          </Card>
        </div>

        {/* Manage Subscription CTA for existing subscribers */}
        <div className="mt-12 text-center">
          <p className="text-muted-foreground mb-4">
            Already subscribed? Manage your plan.
          </p>
          <ManageSubscriptionButton className="mx-auto w-full max-w-sm" />
        </div>
      </div>
    </div>
  );
}
