import type { ReactElement } from 'react';

import { CheckoutSubscriptionSync } from '@/app/(app)/settings/billing/components/CheckoutSubscriptionSync';
import { Suspense } from 'react';

/**
 * Suspense host for the search-param-driven post-checkout sync client.
 */
export function CheckoutSubscriptionSyncHost(): ReactElement {
  return (
    <Suspense fallback={null}>
      <CheckoutSubscriptionSync />
    </Suspense>
  );
}
