import type { ReactElement } from 'react';

import { UsageRows } from '@/app/(app)/settings/billing/components/BillingCards';
import { UsageSkeleton } from '@/app/(app)/settings/billing/components/BillingCardsSkeleton';
import {
  LedgerSectionBlock,
  SettingsLedgerPanel,
} from '@/app/(app)/settings/components/LedgerPrimitives';
import { SETTINGS_SECTIONS } from '@/app/(app)/settings/settings-section-ids';
import { Suspense } from 'react';

export default function SettingsUsagePage(): ReactElement {
  return (
    <SettingsLedgerPanel>
      <LedgerSectionBlock id={SETTINGS_SECTIONS.usage} label='Usage' divided>
        <Suspense fallback={<UsageSkeleton />}>
          <UsageRows />
        </Suspense>
      </LedgerSectionBlock>
    </SettingsLedgerPanel>
  );
}
