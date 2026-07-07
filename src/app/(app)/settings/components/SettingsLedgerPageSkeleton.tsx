import type { ReactElement } from 'react';

import { ModelSelectionCardSkeleton } from '@/app/(app)/settings/ai/components/ModelSelectionCardSkeleton';
import {
  BillingPlanSkeleton,
  UsageSkeleton,
} from '@/app/(app)/settings/billing/components/BillingCardsSkeleton';
import {
  LedgerSectionBlock,
  SettingsLedgerPanel,
} from '@/app/(app)/settings/components/LedgerPrimitives';
import {
  SettingsScrollTarget,
  type SettingsSectionId,
} from '@/app/(app)/settings/components/SettingsScrollTarget';
import { ProfileFormSkeleton } from '@/app/(app)/settings/profile/components/ProfileFormSkeleton';
import { Skeleton } from '@/components/ui/skeleton';

function IntegrationRowsSkeleton(): ReactElement {
  return (
    <>
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={`integration-skeleton-${index}`}
          className='flex items-center justify-between gap-4 py-3.5'
        >
          <Skeleton className='h-4 w-32' />
          <Skeleton className='h-5 w-24 rounded-full' />
        </div>
      ))}
    </>
  );
}

function NotificationsSkeleton(): ReactElement {
  return (
    <>
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={`notification-skeleton-${index}`}
          className='flex items-center justify-between gap-4 py-3.5'
        >
          <Skeleton className='h-4 w-36' />
          <Skeleton className='h-5 w-24 rounded-full' />
        </div>
      ))}
    </>
  );
}

export function SettingsLedgerPageSkeleton({
  scrollTo,
}: {
  scrollTo?: SettingsSectionId;
}): ReactElement {
  return (
    <>
      <SettingsScrollTarget sectionId={scrollTo} />

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
          <ProfileFormSkeleton />
        </LedgerSectionBlock>

        <LedgerSectionBlock
          id='billing'
          label='Plan & billing'
          description='Subscription, renewal, and payment details.'
        >
          <BillingPlanSkeleton />
        </LedgerSectionBlock>

        <LedgerSectionBlock
          id='usage'
          label='Usage'
          description='Monthly quota across your workspace.'
        >
          <UsageSkeleton />
        </LedgerSectionBlock>

        <LedgerSectionBlock
          id='ai'
          label='AI model'
          description='The model that drafts your plans and lessons.'
        >
          <ModelSelectionCardSkeleton />
        </LedgerSectionBlock>

        <LedgerSectionBlock
          id='integrations'
          label='Integrations'
          description='Connect Atlaris to the rest of your stack.'
        >
          <IntegrationRowsSkeleton />
        </LedgerSectionBlock>

        <LedgerSectionBlock
          id='notifications'
          label='Notifications'
          description='What Atlaris is allowed to email you about.'
        >
          <NotificationsSkeleton />
        </LedgerSectionBlock>
      </SettingsLedgerPanel>
    </>
  );
}
