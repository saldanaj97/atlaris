import type { ReactElement } from 'react';

import { BillingCards } from '@/app/(app)/settings/billing/components/BillingCards';
import { BillingCardsSkeleton } from '@/app/(app)/settings/billing/components/BillingCardsSkeleton';
import { PageHeader } from '@/components/ui/page-header';
import { getSupportedLocale } from '@/lib/i18n/locale';
import { headers } from 'next/headers';
import { Suspense } from 'react';

/**
 * Billing Settings sub-page.
 *
 * Rendered inside the shared settings layout.
 * The billing cards (Current Plan + Usage) wait for subscription and usage data.
 */
export default async function BillingSettingsPage(): Promise<ReactElement> {
  const locale = getSupportedLocale((await headers()).get('accept-language'));

  return (
    <>
      <PageHeader
        title='Billing'
        subtitle='Manage your subscription and view usage'
      />

      <div className='grid gap-6 md:grid-cols-2'>
        <Suspense fallback={<BillingCardsSkeleton />}>
          <BillingCards locale={locale} />
        </Suspense>
      </div>
    </>
  );
}
