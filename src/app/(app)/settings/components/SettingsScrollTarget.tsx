'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import {
  SETTINGS_SECTIONS,
  getSettingsSectionIdFromPathname,
  parseSettingsSectionHash,
  settingsSectionPath,
  type SettingsSectionId,
} from '@/app/(app)/settings/settings-section-ids';
import { cn } from '@/lib/utils';
import {
  Bell,
  Crown,
  Link as LinkIcon,
  Monitor,
  UserRound,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

type SettingsNavItem = {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: LucideIcon;
};

type SettingsContentHeadingCopy = {
  title: string;
  description: string;
};

const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  {
    id: SETTINGS_SECTIONS.profile,
    label: 'Profile',
    description: 'Name and account details',
    icon: UserRound,
  },
  {
    id: SETTINGS_SECTIONS.billing,
    label: 'Plan & billing',
    description: 'Subscription and payment',
    icon: Crown,
  },
  {
    id: SETTINGS_SECTIONS.usage,
    label: 'Usage',
    description: 'Plan and generation limits',
    icon: Zap,
  },
  {
    id: SETTINGS_SECTIONS.ai,
    label: 'AI model',
    description: 'Generation preferences',
    icon: Monitor,
  },
  {
    id: SETTINGS_SECTIONS.integrations,
    label: 'Integrations',
    description: 'Connected tools',
    icon: LinkIcon,
  },
  {
    id: SETTINGS_SECTIONS.notifications,
    label: 'Notifications',
    description: 'Email preferences',
    icon: Bell,
  },
];

export function getSettingsContentHeading(
  sectionId: SettingsSectionId,
): SettingsContentHeadingCopy {
  switch (sectionId) {
    case SETTINGS_SECTIONS.profile:
    case SETTINGS_SECTIONS.billing:
    case SETTINGS_SECTIONS.usage:
      return {
        title: 'Account',
        description: 'Manage your profile, plan, and account settings.',
      };
    case SETTINGS_SECTIONS.ai:
      return {
        title: 'AI model',
        description: 'Generation preferences',
      };
    case SETTINGS_SECTIONS.integrations:
      return {
        title: 'Integrations',
        description: 'Connected tools',
      };
    case SETTINGS_SECTIONS.notifications:
      return {
        title: 'Notifications',
        description: 'Email preferences',
      };
    default: {
      const _exhaustiveCheck: never = sectionId;
      return _exhaustiveCheck;
    }
  }
}

export function SettingsLegacyHashRedirect(): null {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const sectionId = parseSettingsSectionHash(window.location.hash);
    if (!sectionId) return;

    const targetPath = settingsSectionPath(sectionId);
    const search = window.location.search;
    if (pathname === targetPath && window.location.hash === '') {
      return;
    }

    router.replace(`${targetPath}${search}`);
  }, [pathname, router]);

  return null;
}

export function SettingsContentHeading(): ReactElement {
  const pathname = usePathname();
  const heading = getSettingsContentHeading(
    getSettingsSectionIdFromPathname(pathname),
  );

  return (
    <div data-testid='settings-content-heading'>
      <h2
        id='settings-content-heading'
        className='font-heading text-[32px] leading-10 tracking-[-0.02em] text-foreground sm:text-[40px] sm:leading-[46px]'
      >
        {heading.title}
      </h2>
      <p className='mt-1.5 max-w-xl text-sm leading-[22px] text-muted-foreground'>
        {heading.description}
      </p>
    </div>
  );
}

export function SettingsSectionNavigation(): ReactElement {
  const pathname = usePathname();
  const activeSection = getSettingsSectionIdFromPathname(pathname);

  return (
    <nav aria-label='Settings sections' className='h-fit min-w-0'>
      <ul className='grid gap-1 sm:grid-cols-2 lg:grid-cols-1'>
        {SETTINGS_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const href = settingsSectionPath(item.id);
          const isActive = item.id === activeSection;

          return (
            <li key={item.id}>
              <Link
                href={href}
                data-active={isActive ? 'true' : 'false'}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'group relative flex min-h-11 min-w-0 items-start gap-2 rounded-lg px-3 py-2 pl-3.5 text-left transition-colors',
                  'hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
                  'data-[active=true]:bg-primary/10 data-[active=true]:text-foreground',
                )}
              >
                <span
                  aria-hidden='true'
                  className={cn(
                    'absolute top-2 bottom-2 left-0 w-0.5',
                    isActive ? 'bg-primary' : 'bg-transparent',
                  )}
                />
                <Icon
                  aria-hidden='true'
                  className={cn(
                    'mt-0.5 size-5 shrink-0',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground group-hover:text-foreground',
                  )}
                />
                <span className='min-w-0'>
                  <span className='block text-sm font-medium [overflow-wrap:anywhere]'>
                    {item.label}
                  </span>
                  <span className='mt-0.5 block text-xs leading-[18px] [overflow-wrap:anywhere] text-muted-foreground'>
                    {item.description}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
