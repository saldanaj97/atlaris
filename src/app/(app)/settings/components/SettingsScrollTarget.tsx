'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import {
  SETTINGS_SECTION_IDS,
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from '@/app/(app)/settings/settings-section-ids';
import {
  Bell,
  BookOpen,
  CircleGauge,
  CircleUserRound,
  CreditCard,
  Link2,
  Sparkles,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type SettingsNavItem = {
  id: SettingsSectionId;
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

function parseSectionHash(hash: string): SettingsSectionId | undefined {
  const sectionId = hash.replace(/^#/, '');
  return SETTINGS_SECTION_IDS.includes(sectionId as SettingsSectionId)
    ? (sectionId as SettingsSectionId)
    : undefined;
}

function scrollToSection(sectionId: SettingsSectionId): void {
  document.getElementById(sectionId)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

export function useSettingsSectionHash(): SettingsSectionId {
  const pathname = usePathname();
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>('profile');

  useEffect(() => {
    const syncFromHash = (): void => {
      if (window.location.pathname !== pathname) return;

      const sectionId = parseSectionHash(window.location.hash);
      if (sectionId) {
        setActiveSection(sectionId);
        scrollToSection(sectionId);
        return;
      }

      setActiveSection('profile');
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);

    return () => {
      window.removeEventListener('hashchange', syncFromHash);
    };
  }, [pathname]);

  return activeSection;
}

export function SettingsSectionNavigation(): ReactElement {
  const activeSection = useSettingsSectionHash();

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
        {SETTINGS_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeSection;

          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                data-active={isActive ? 'true' : 'false'}
                aria-current={isActive ? 'location' : undefined}
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
