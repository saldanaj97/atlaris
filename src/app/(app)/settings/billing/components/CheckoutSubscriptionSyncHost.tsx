import type { ReactElement } from 'react';

import { getCheckoutBillingBaseline } from '@/app/(app)/settings/billing/components/BillingCards';
import { CheckoutSubscriptionSync } from '@/app/(app)/settings/billing/components/CheckoutSubscriptionSync';
import { Suspense } from 'react';

/**
 * Server host that supplies the current DB billing baseline to the bounded
 * post-checkout sync client. Only meaningful when `?checkout=1` is present.
 */
export async function CheckoutSubscriptionSyncHost(): Promise<ReactElement | null> {
  const baseline = await getCheckoutBillingBaseline();
  if (!baseline) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <CheckoutSubscriptionSync baseline={baseline} />
    </Suspense>
  );
}
