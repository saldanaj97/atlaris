import SubscribeButton from '@/components/billing/SubscribeButton';
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

export default async function PricingPage() {
  const starterMonthly = getEnv('STRIPE_STARTER_MONTHLY_PRICE_ID');
  const starterYearly = getEnv('STRIPE_STARTER_YEARLY_PRICE_ID');
  const proMonthly = getEnv('STRIPE_PRO_MONTHLY_PRICE_ID');
  const proYearly = getEnv('STRIPE_PRO_YEARLY_PRICE_ID');

  const missingPrices = !starterMonthly || !starterYearly || !proMonthly || !proYearly;

  let starterName = 'Starter';
  let starterMonthlyAmount = '$—';
  let proName = 'Pro';
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

    starterName = (starterProduct && 'name' in starterProduct && starterProduct.name) || 'Starter';
    proName = (proProduct && 'name' in proProduct && proProduct.name) || 'Pro';

    starterMonthlyAmount = formatAmount(starterMonthlyPrice.unit_amount, starterMonthlyPrice.currency?.toUpperCase());
    proMonthlyAmount = formatAmount(proMonthlyPrice.unit_amount, proMonthlyPrice.currency?.toUpperCase());
  }

  return (
    <div className="bg-gradient-subtle min-h-screen">
      <div className="container mx-auto px-6 py-12">
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-4xl font-bold">Choose your plan</h1>
          <p className="text-muted-foreground">Upgrade for more capacity and features.</p>
        </div>

        {missingPrices ? (
          <Card className="border-destructive/30 bg-destructive/5 mx-auto mb-8 max-w-3xl border p-4 text-sm text-destructive">
            Stripe price IDs are not configured. Set STRIPE_*_PRICE_ID env vars.
          </Card>
        ) : null}

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="bg-gradient-card border-0 p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Free</h2>
              <Badge variant="secondary">Current</Badge>
            </div>
            <p className="mb-4 text-3xl font-bold">$0</p>
            <ul className="text-muted-foreground mb-6 space-y-2 text-sm">
              <li>Up to 3 active plans</li>
              <li>5 regenerations per month</li>
              <li>10 exports per month</li>
            </ul>
            <Button asChild variant="secondary" className="w-full">
              <Link href="/dashboard">Continue Free</Link>
            </Button>
          </Card>

          <Card className="bg-gradient-card border-primary/50 relative border p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{starterName}</h2>
              <Badge>Popular</Badge>
            </div>
            <p className="mb-1 text-3xl font-bold">{starterMonthlyAmount}</p>
            <p className="text-muted-foreground mb-4 text-sm">per month</p>
            <ul className="text-muted-foreground mb-6 space-y-2 text-sm">
              <li>Up to 10 active plans</li>
              <li>10 regenerations per month</li>
              <li>50 exports per month</li>
              <li>Priority queue</li>
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
          </Card>

          <Card className="bg-gradient-card border-0 p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{proName}</h2>
              <Badge variant="outline">Best</Badge>
            </div>
            <p className="mb-1 text-3xl font-bold">{proMonthlyAmount}</p>
            <p className="text-muted-foreground mb-4 text-sm">per month</p>
            <ul className="text-muted-foreground mb-6 space-y-2 text-sm">
              <li>Unlimited active plans</li>
              <li>50 regenerations per month</li>
              <li>Unlimited exports</li>
              <li>Highest priority + analytics</li>
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
      </div>
    </div>
  );
}
