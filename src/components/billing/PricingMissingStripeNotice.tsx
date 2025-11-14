import { Card } from '../ui/card';

export function PricingMissingStripeNotice() {
  return (
    <Card className="border-destructive/30 bg-destructive/5 text-destructive mx-auto mb-8 max-w-3xl border p-4 text-sm">
      Stripe price IDs are not configured. Set STRIPE_*_PRICE_ID env vars.
    </Card>
  );
}
