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
import { IntegrationRows } from '@/app/(app)/settings/integrations/components/IntegrationRows';
import { NotificationsSection } from '@/app/(app)/settings/notifications/components/NotificationsSection';
import { ProfileForm } from '@/app/(app)/settings/profile/components/ProfileForm';
import { shouldUseClerkUi } from '@/lib/auth/local-identity';
import { getSupportedLocale } from '@/lib/i18n/locale';
import { UserProfile } from '@clerk/nextjs';
import { headers } from 'next/headers';
import { Suspense } from 'react';

export async function SettingsLedgerPage(): Promise<ReactElement> {
  const locale = getSupportedLocale((await headers()).get('accept-language'));
  const showClerkBilling = shouldUseClerkUi();

  return (
    <>
      <header className='relative mb-6'>
        <h1>Settings</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          Everything about your account, on one page.
        </p>
      </header>

      <SettingsLedgerPanel>
        <LedgerSectionBlock
          id='profile'
          label='Profile'
          description='How you appear across Atlaris.'
        >
          <ProfileForm locale={locale} />
        </LedgerSectionBlock>

        <LedgerSectionBlock
          id='billing'
          label='Plan & billing'
          description='Subscription, renewal, and payment details.'
        >
          <Suspense fallback={<BillingPlanSkeleton />}>
            <BillingPlanRows locale={locale} />
          </Suspense>
          {showClerkBilling ? (
            <div className='py-3.5 last:pb-0'>
              <UserProfile
                routing='hash'
                appearance={{
                  elements: {
                    rootBox: 'w-full',
                    cardBox: 'w-full shadow-none',
                  },
                }}
              />
            </div>
          ) : null}
        </LedgerSectionBlock>

        <LedgerSectionBlock
          id='usage'
          label='Usage'
          description='Monthly quota across your workspace.'
        >
          <Suspense fallback={<UsageSkeleton />}>
            <UsageRows />
          </Suspense>
        </LedgerSectionBlock>

        <LedgerSectionBlock
          id='ai'
          label='AI model'
          description='The model that drafts your plans and lessons.'
        >
          <Suspense fallback={<ModelSelectionCardSkeleton />}>
            <ModelSelectionCard />
          </Suspense>
        </LedgerSectionBlock>

        <LedgerSectionBlock
          id='integrations'
          label='Integrations'
          description='Connect Atlaris to the rest of your stack.'
        >
          <IntegrationRows />
        </LedgerSectionBlock>

        <LedgerSectionBlock
          id='notifications'
          label='Notifications'
          description='What Atlaris is allowed to email you about.'
        >
          <NotificationsSection />
        </LedgerSectionBlock>
      </SettingsLedgerPanel>
    </>
  );
}
