import type { ReactElement } from 'react';

import { ModelSelectionCard } from '@/app/(app)/settings/ai/components/ModelSelectionCard';
import { ModelSelectionCardSkeleton } from '@/app/(app)/settings/ai/components/ModelSelectionCardSkeleton';
import {
  BillingPlanRows,
  UsageRows,
} from '@/app/(app)/settings/billing/components/BillingCards';
import { BillingPlanSkeleton } from '@/app/(app)/settings/billing/components/BillingCardsSkeleton';
import { UsageSkeleton } from '@/app/(app)/settings/billing/components/BillingCardsSkeleton';
import { CheckoutSubscriptionSyncHost } from '@/app/(app)/settings/billing/components/CheckoutSubscriptionSyncHost';
import {
  LedgerSectionBlock,
  SettingsLedgerPanel,
} from '@/app/(app)/settings/components/LedgerPrimitives';
import { SettingsSectionNavigation } from '@/app/(app)/settings/components/SettingsScrollTarget';
import { IntegrationRows } from '@/app/(app)/settings/integrations/components/IntegrationRows';
import { NotificationsSection } from '@/app/(app)/settings/notifications/components/NotificationsSection';
import { ProfileForm } from '@/app/(app)/settings/profile/components/ProfileForm';
import { SETTINGS_SECTIONS } from '@/app/(app)/settings/settings-section-ids';
import { CtaBanner } from '@/components/ui/cta-banner';
import { PageHero } from '@/components/ui/page-hero';
import { getSupportedLocale } from '@/lib/i18n/locale';
import { Settings, Sparkles } from 'lucide-react';
import { headers } from 'next/headers';
import { Suspense } from 'react';

function SettingsHero(): ReactElement {
  return (
    <PageHero
      className='mb-5 rounded-[12px] border border-panel-border bg-panel shadow-sm'
      contentClassName='flex min-h-[16rem] max-w-2xl flex-col justify-center px-5 py-8 sm:min-h-[18rem] sm:px-8 sm:py-10 lg:px-10'
      mobile={{ className: 'inset-y-0 right-0 h-full w-[82%] opacity-75' }}
      overline='Settings'
      overlineIcon={<Settings aria-hidden='true' className='size-4' />}
      title={
        <>
          Make Atlaris <span className='text-primary'>yours.</span>
        </>
      }
      titleClassName='font-heading mt-3 max-w-xl text-[32px] leading-[1.1] tracking-[-0.03em] text-balance text-foreground sm:text-[42px]'
      description='Manage your profile, subscription, AI preferences, integrations, and notifications in one place.'
      descriptionClassName='mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base'
    />
  );
}

export async function SettingsLedgerPage(): Promise<ReactElement> {
  const locale = getSupportedLocale((await headers()).get('accept-language'));

  return (
    <>
      <SettingsHero />

      <div className='grid min-w-0 gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]'>
        <SettingsSectionNavigation />

        <SettingsLedgerPanel>
          <LedgerSectionBlock
            id={SETTINGS_SECTIONS.profile}
            label='Profile'
            description='Manage your identity and account contact details.'
          >
            <ProfileForm locale={locale} />
          </LedgerSectionBlock>

          <LedgerSectionBlock
            id={SETTINGS_SECTIONS.billing}
            label='Plan & billing'
            description='Subscription, renewal, and payment details.'
          >
            <CheckoutSubscriptionSyncHost />
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
            description='Choose the models that draft your plans and lessons.'
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
            description='Choose which optional emails Atlaris sends.'
          >
            <NotificationsSection />
          </LedgerSectionBlock>
        </SettingsLedgerPanel>
      </div>

      <CtaBanner
        artwork='horizon'
        aria-labelledby='settings-journey-title'
        className='mt-5'
      >
        <div className='relative z-10 flex min-h-[9rem] items-center px-5 py-6 sm:px-8 sm:py-7'>
          <div className='max-w-xl'>
            <h2
              id='settings-journey-title'
              className='flex items-center gap-2 text-sm font-semibold text-foreground'
            >
              <Sparkles aria-hidden='true' className='size-5 text-primary' />
              Keep shaping your learning orbit.
            </h2>
            <p className='mt-2 text-sm leading-relaxed text-muted-foreground'>
              Adjust your settings anytime as your goals and learning rhythm
              change.
            </p>
          </div>
        </div>
      </CtaBanner>
    </>
  );
}
