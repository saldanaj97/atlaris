import type { ReactElement } from 'react';

import { BillingPlanRows } from '@/app/(app)/settings/billing/components/BillingCards';
import { BillingPlanSkeleton } from '@/app/(app)/settings/billing/components/BillingCardsSkeleton';
import { CheckoutSubscriptionSyncHost } from '@/app/(app)/settings/billing/components/CheckoutSubscriptionSyncHost';
import {
  LedgerSectionBlock,
  SettingsLedgerPanel,
} from '@/app/(app)/settings/components/LedgerPrimitives';
import { SETTINGS_SECTIONS } from '@/app/(app)/settings/settings-section-ids';
import { getSupportedLocale } from '@/lib/i18n/locale';
import { headers } from 'next/headers';
import { Suspense } from 'react';

export default async function SettingsBillingPage(): Promise<ReactElement> {
  const locale = getSupportedLocale((await headers()).get('accept-language'));

  return (
    <SettingsLedgerPanel>
      <LedgerSectionBlock id={SETTINGS_SECTIONS.billing} label='Plan & billing'>
        <CheckoutSubscriptionSyncHost />
        <Suspense fallback={<BillingPlanSkeleton />}>
          <BillingPlanRows locale={locale} />
        </Suspense>
      </LedgerSectionBlock>
    </SettingsLedgerPanel>
  );
}
