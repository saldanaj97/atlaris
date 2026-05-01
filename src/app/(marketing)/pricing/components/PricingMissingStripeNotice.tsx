import { AlertCircle } from 'lucide-react';
import type { ReactElement } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface PricingMissingStripeNoticeProps {
  title?: string;
  message?: string;
}

export function PricingMissingStripeNotice({
  title = 'Stripe pricing unavailable',
  message = 'Stripe pricing is not currently available. Please contact support if this persists.',
}: PricingMissingStripeNoticeProps): ReactElement {
  return (
    <Alert
      variant="destructive"
      className="mx-auto mb-8 max-w-3xl border-destructive/30 bg-destructive/5"
    >
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
