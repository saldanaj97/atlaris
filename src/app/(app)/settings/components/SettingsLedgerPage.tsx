import type { LucideIcon } from 'lucide-react';
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
import { SettingsScrollTarget } from '@/app/(app)/settings/components/SettingsScrollTarget';
import { IntegrationRows } from '@/app/(app)/settings/integrations/components/IntegrationRows';
import { NotificationsSection } from '@/app/(app)/settings/notifications/components/NotificationsSection';
import { ProfileForm } from '@/app/(app)/settings/profile/components/ProfileForm';
import { SETTINGS_SECTIONS } from '@/app/(app)/settings/settings-section-ids';
import { CtaBanner } from '@/components/ui/cta-banner';
import { ResponsiveBackdrop } from '@/components/ui/responsive-backdrop';
import { SectionOverline } from '@/components/ui/section-overline';
import { getSupportedLocale } from '@/lib/i18n/locale';
import {
  Bell,
  BookOpen,
  CircleGauge,
  CircleUserRound,
  CreditCard,
  Link2,
  Settings,
  Sparkles,
} from 'lucide-react';
import { headers } from 'next/headers';
import { Suspense } from 'react';

type SettingsNavItem = {
  id: (typeof SETTINGS_SECTIONS)[keyof typeof SETTINGS_SECTIONS];
  label: string;
  description: string;
  icon: LucideIcon;
};

const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  {
    id: SETTINGS_SECTIONS.profile,
    label: 'Profile',
    description: 'Name and account details',
    icon: CircleUserRound,
  },
  {
    id: SETTINGS_SECTIONS.billing,
    label: 'Plan & billing',
    description: 'Subscription and payment',
    icon: CreditCard,
  },
  {
    id: SETTINGS_SECTIONS.usage,
    label: 'Usage',
    description: 'Plan and generation limits',
    icon: CircleGauge,
  },
  {
    id: SETTINGS_SECTIONS.ai,
    label: 'AI model',
    description: 'Generation preferences',
    icon: Sparkles,
  },
  {
    id: SETTINGS_SECTIONS.integrations,
    label: 'Integrations',
    description: 'Connected tools',
    icon: Link2,
  },
  {
    id: SETTINGS_SECTIONS.notifications,
    label: 'Notifications',
    description: 'Email preferences',
    icon: Bell,
  },
];

function SettingsHero(): ReactElement {
  return (
    <header className='relative isolate mb-5 overflow-hidden rounded-[12px] border border-panel-border bg-panel shadow-sm'>
      <ResponsiveBackdrop
        desktop={{
          src: '/artwork/planetary-horizon-desktop.jpg',
          objectPosition: '78% 50%',
          className: 'opacity-80',
        }}
        mobile={{
          src: '/artwork/planetary-horizon-mobile.jpg',
          objectPosition: '68% 42%',
          className: 'inset-y-0 right-0 h-full w-[82%] opacity-75',
        }}
      />

      <div className='relative z-10 flex min-h-[16rem] flex-col justify-center px-5 py-8 sm:min-h-[18rem] sm:px-8 sm:py-10 lg:px-10'>
        <div className='max-w-2xl'>
          <SectionOverline
            icon={<Settings aria-hidden='true' className='size-4' />}
          >
            Settings
          </SectionOverline>
          <h1 className='font-heading mt-3 max-w-xl text-[32px] leading-[1.1] tracking-[-0.03em] text-balance text-foreground sm:text-[42px]'>
            Make Atlaris <span className='text-primary'>yours.</span>
          </h1>
          <p className='mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base'>
            Manage your profile, subscription, AI preferences, integrations, and
            notifications in one place.
          </p>
        </div>
      </div>
    </header>
  );
}

function SettingsSectionNavigation(): ReactElement {
  return (
    <nav
      aria-label='Settings sections'
      className='h-fit min-w-0 rounded-[12px] border border-panel-border bg-panel p-2 shadow-sm lg:sticky lg:top-24'
    >
      <div className='mb-1 flex items-center gap-2 px-3 py-2 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase'>
        <BookOpen aria-hidden='true' className='size-4' />
        Your settings
      </div>
      <ul className='grid gap-1 sm:grid-cols-2 lg:grid-cols-1'>
        {SETTINGS_NAV_ITEMS.map((item, index) => {
          const Icon = item.icon;

          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                data-settings-section-link='true'
                data-section-id={item.id}
                data-active={index === 0 ? 'true' : undefined}
                className='group flex min-h-[56px] min-w-0 items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:border-panel-border hover:bg-panel-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-panel focus-visible:outline-none data-[active=true]:border-primary/25 data-[active=true]:bg-primary/10 data-[active=true]:text-foreground'
              >
                <span className='flex size-9 shrink-0 items-center justify-center rounded-md bg-panel-muted text-muted-foreground transition-colors group-data-[active=true]:bg-primary/15 group-data-[active=true]:text-primary'>
                  <Icon aria-hidden='true' className='size-5' />
                </span>
                <span className='min-w-0'>
                  <span className='block truncate text-sm font-medium'>
                    {item.label}
                  </span>
                  <span className='mt-0.5 block truncate text-xs text-muted-foreground'>
                    {item.description}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export async function SettingsLedgerPage(): Promise<ReactElement> {
  const locale = getSupportedLocale((await headers()).get('accept-language'));

  return (
    <>
      <SettingsScrollTarget />
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
