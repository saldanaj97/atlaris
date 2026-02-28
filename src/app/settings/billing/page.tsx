import type { ReactElement } from 'react';
import { Suspense } from 'react';

import { BillingCards } from '@/app/settings/billing/components/BillingCards';
import { BillingCardsSkeleton } from '@/app/settings/billing/components/BillingCardsSkeleton';

/**
 * Billing Settings sub-page.
 *
 * Rendered inside the shared settings layout.
 * The billing cards (Current Plan + Usage) wait for subscription and usage data.
 */
export default function BillingSettingsPage(): ReactElement {
  return (
    <>
      <header className="mb-6">
        <h2 className="text-xl font-semibold">Billing</h2>
        <p className="text-muted-foreground text-sm">
          Manage your subscription and view usage
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <Suspense fallback={<BillingCardsSkeleton />}>
          <BillingCards />
        </Suspense>
      </div>
    </>
  );
}
