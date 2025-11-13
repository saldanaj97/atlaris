import { stripeEnv } from '@/lib/config/env';
import SubscribeButton from './SubscribeButton';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { getStripe } from '../../lib/stripe/client';
import { PRICING_TIERS } from './PricingTiers';

function formatAmount(cents?: number | null, currency: string = 'USD') {
  if (cents == null) return '—';
  const amount = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default async function YearlyPricingCards() {
  // TODO: Make sure this is safe
  const { starterYearly, proYearly } = stripeEnv.pricing;

  const missingPrices = !starterYearly || !proYearly;

  let starterName: string = PRICING_TIERS.starter.name;
  let starterYearlyAmount = '$—';
  let proName: string = PRICING_TIERS.pro.name;
  let proYearlyAmount = '$—';

  if (starterYearly && proYearly) {
    const stripe = getStripe();
    const [starterYearlyPrice, proYearlyPrice] = await Promise.all([
      stripe.prices.retrieve(starterYearly),
      stripe.prices.retrieve(proYearly),
    ]);

    // Expand products individually to safely access product names across API versions
    const [starterProduct, proProduct] = await Promise.all([
      typeof starterYearlyPrice.product === 'string'
        ? stripe.products.retrieve(starterYearlyPrice.product)
        : Promise.resolve(starterYearlyPrice.product),
      typeof proYearlyPrice.product === 'string'
        ? stripe.products.retrieve(proYearlyPrice.product)
        : Promise.resolve(proYearlyPrice.product),
    ]);

    starterName =
      (starterProduct && 'name' in starterProduct && starterProduct.name) ||
      PRICING_TIERS.starter.name;
    proName =
      (proProduct && 'name' in proProduct && proProduct.name) ||
      PRICING_TIERS.pro.name;

    starterYearlyAmount = formatAmount(
      starterYearlyPrice.unit_amount,
      starterYearlyPrice.currency?.toUpperCase()
    );
    proYearlyAmount = formatAmount(
      proYearlyPrice.unit_amount,
      proYearlyPrice.currency?.toUpperCase()
    );
  }

  return (
    <div className="bg-background container mx-auto px-6 py-8">
      {missingPrices ? (
        <Card className="border-destructive/30 bg-destructive/5 text-destructive mx-auto mb-8 max-w-3xl border p-4 text-sm">
          Stripe price IDs are not configured. Set STRIPE_*_PRICE_ID env vars.
        </Card>
      ) : null}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Free Tier */}
        <Card className="flex min-h-[400px] flex-col justify-between p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{PRICING_TIERS.free.name}</h2>
            <Badge variant={PRICING_TIERS.free.variant}>
              {PRICING_TIERS.free.badge}
            </Badge>
          </div>
          <div className="flex flex-1 flex-col items-start">
            <p className="mb-4 text-3xl font-bold">
              {PRICING_TIERS.free.price} / year
            </p>
            <ul className="text-muted-foreground mb-6 space-y-2 text-sm">
              {PRICING_TIERS.free.features.map((feature, idx) => (
                <li key={idx}>{feature}</li>
              ))}
            </ul>
          </div>
          <div className="w-full px-12">
            <Button
              asChild
              variant={PRICING_TIERS.free.variant}
              className="w-full"
            >
              {PRICING_TIERS.free.button}
            </Button>
          </div>
        </Card>

        {/* Starter Tier - Recommended */}
        <Card className="relative p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{starterName}</h2>
            <Badge variant="default">{PRICING_TIERS.starter.badge}</Badge>
          </div>
          <div className="flex flex-1 flex-col items-start">
            <p className="mb-4 text-3xl font-bold">
              {starterYearlyAmount} / year
            </p>
            <ul className="text-muted-foreground mb-6 space-y-2 text-sm">
              {PRICING_TIERS.starter.features.map((feature, idx) => (
                <li key={idx}>{feature}</li>
              ))}
            </ul>
          </div>
          <div className="w-full px-12">
            <SubscribeButton
              priceId={starterYearly ?? ''}
              label="Subscribe Yearly"
              className="w-full"
            />
          </div>
          {PRICING_TIERS.starter.recommended && (
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-1/2 transform">
              <Badge className="bg-main text-main-foreground rounded-base border-2 px-3 py-1 text-xs font-bold">
                Most Popular
              </Badge>
            </div>
          )}
        </Card>

        {/* Pro Tier */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{proName}</h2>
            <Badge variant="neutral">{PRICING_TIERS.pro.badge}</Badge>
          </div>
          <div className="flex flex-1 flex-col items-start">
            <p className="mb-4 text-3xl font-bold">{proYearlyAmount} / year</p>
            <ul className="text-muted-foreground mb-6 space-y-2 text-sm">
              {PRICING_TIERS.pro.features.map((feature, idx) => (
                <li key={idx}>{feature}</li>
              ))}
            </ul>
          </div>
          <div className="w-full px-12">
            <SubscribeButton
              priceId={proYearly ?? ''}
              label="Subscribe Yearly"
              className="w-full"
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
