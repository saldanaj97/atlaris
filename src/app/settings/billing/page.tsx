import { Suspense } from 'react';

import { BillingCards, BillingCardsSkeleton } from './components/BillingCards';

/**
 * Billing Settings page with Suspense boundary for data-dependent content.
 *
 * Static elements (title) render immediately.
 * The billing cards (Current Plan + Usage) wait for subscription and usage data.
 */
export default function BillingSettingsPage() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Static content - renders immediately */}
        <h1 className="mb-6 text-3xl font-bold">Billing</h1>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Data-dependent cards - wrapped in Suspense */}
          <Suspense fallback={<BillingCardsSkeleton />}>
            <BillingCards />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
