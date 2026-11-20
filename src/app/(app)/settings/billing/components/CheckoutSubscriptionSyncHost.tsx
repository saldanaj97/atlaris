import type { ReactElement } from 'react';

import { CheckoutSubscriptionSync } from '@/app/(app)/settings/billing/components/CheckoutSubscriptionSync';
import { Suspense } from 'react';

export function CheckoutSubscriptionSyncHost(): ReactElement {
  return (
    <Suspense fallback={null}>
      <CheckoutSubscriptionSync />
    </Suspense>
  );
}
