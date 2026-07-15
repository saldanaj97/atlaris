import type { ReactElement } from 'react';

import { ModelSelectionCard } from '@/app/(app)/settings/ai/components/ModelSelectionCard';
import { ModelSelectionCardSkeleton } from '@/app/(app)/settings/ai/components/ModelSelectionCardSkeleton';
import {
  BillingPlanRows,
  UsageRows,
} from '@/app/(app)/settings/billing/components/BillingCards';
import { BillingPlanSkeleton } from '@/app/(app)/settings/billing/components/BillingCardsSkeleton';
import { UsageSkeleton } from '@/app/(app)/settings/billing/components/BillingCardsSkeleton';
import {
  LedgerSectionBlock,
  SettingsLedgerPanel,
} from '@/app/(app)/settings/components/LedgerPrimitives';
import { SettingsScrollTarget } from '@/app/(app)/settings/components/SettingsScrollTarget';
import { IntegrationRows } from '@/app/(app)/settings/integrations/components/IntegrationRows';
import { NotificationsSection } from '@/app/(app)/settings/notifications/components/NotificationsSection';
import { ProfileForm } from '@/app/(app)/settings/profile/components/ProfileForm';
import { SETTINGS_SECTIONS } from '@/app/(app)/settings/settings-section-ids';
import { getSupportedLocale } from '@/lib/i18n/locale';
import { headers } from 'next/headers';
import { Suspense } from 'react';

export async function SettingsLedgerPage(): Promise<ReactElement> {
  const locale = getSupportedLocale((await headers()).get('accept-language'));

  return (
    <>
      <SettingsScrollTarget />

      <header className='relative mb-6'>
        <h1>Settings</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          Everything about your account, on one page.
        </p>
      </header>

      <SettingsLedgerPanel>
        <LedgerSectionBlock
          id={SETTINGS_SECTIONS.profile}
          label='Profile'
          description='How you appear across Atlaris.'
        >
          <ProfileForm locale={locale} />
        </LedgerSectionBlock>

        <LedgerSectionBlock
          id={SETTINGS_SECTIONS.billing}
          label='Plan & billing'
          description='Subscription, renewal, and payment details.'
        >
          <Suspense fallback={<BillingPlanSkeleton />}>
            <BillingPlanRows locale={locale} />
          </Suspense>
        </LedgerSectionBlock>

        <LedgerSectionBlock
          id={SETTINGS_SECTIONS.usage}
          label='Usage'
          description='Monthly quota across your workspace.'
        >
          <Suspense fallback={<UsageSkeleton />}>
            <UsageRows />
          </Suspense>
        </LedgerSectionBlock>

        <LedgerSectionBlock
          id={SETTINGS_SECTIONS.ai}
          label='AI model'
          description='The model that drafts your plans and lessons.'
        >
          <Suspense fallback={<ModelSelectionCardSkeleton />}>
            <ModelSelectionCard />
          </Suspense>
        </LedgerSectionBlock>

        <LedgerSectionBlock
          id={SETTINGS_SECTIONS.integrations}
          label='Integrations'
          description='Connect Atlaris to the rest of your stack.'
        >
          <IntegrationRows />
        </LedgerSectionBlock>

        <LedgerSectionBlock
          id={SETTINGS_SECTIONS.notifications}
          label='Notifications'
          description='What Atlaris is allowed to email you about.'
        >
          <NotificationsSection />
        </LedgerSectionBlock>
      </SettingsLedgerPanel>
    </>
  );
}
