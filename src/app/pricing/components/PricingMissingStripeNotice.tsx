import type { ReactElement } from 'react';
import { AlertCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface PricingMissingStripeNoticeProps {
  title?: string;
  message?: string;
}

export function PricingMissingStripeNotice({
  title = 'Stripe pricing unavailable',
  message = 'Stripe price IDs are not configured. Set STRIPE_*_PRICE_ID env vars.',
}: PricingMissingStripeNoticeProps): ReactElement {
  return (
    <Alert
      variant="destructive"
      className="border-destructive/30 bg-destructive/5 mx-auto mb-8 max-w-3xl"
    >
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
