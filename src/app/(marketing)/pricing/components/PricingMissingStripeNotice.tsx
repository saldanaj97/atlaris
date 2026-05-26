import type { ReactElement } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

export function PricingMissingStripeNotice(): ReactElement {
  return (
    <Alert
      variant='destructive'
      className='mx-auto mb-8 max-w-3xl border-destructive/30 bg-destructive/5'
    >
      <AlertCircle aria-hidden='true' />
      <AlertTitle>Stripe pricing unavailable</AlertTitle>
      <AlertDescription>
        Stripe pricing is not currently available. Please contact support if
        this persists.
      </AlertDescription>
    </Alert>
  );
}
