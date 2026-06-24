'use client';

import { cn } from '@/lib/utils';
import {
  Bell,
  Bot,
  CreditCard,
  Link2,
  type LucideIcon,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SettingsNavItem {
  label: string;
  mobileLabel: string;
  href: string;
  icon: LucideIcon;
}

const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  {
    label: 'Profile',
    mobileLabel: 'Profile',
    href: '/settings/profile',
    icon: User,
  },
  {
    label: 'Billing',
    mobileLabel: 'Billing',
    href: '/settings/billing',
    icon: CreditCard,
  },
  {
    label: 'AI Preferences',
    mobileLabel: 'AI',
    href: '/settings/ai',
    icon: Bot,
  },
  {
    label: 'Integrations',
    mobileLabel: 'Apps',
    href: '/settings/integrations',
    icon: Link2,
  },
  {
    label: 'Notifications',
    mobileLabel: 'Alerts',
    href: '/settings/notifications',
    icon: Bell,
  },
];

export function SettingsSidebar(): React.ReactElement {
  const pathname = usePathname();

  return (
    <nav
      aria-label='Settings'
      className='grid grid-cols-5 gap-1 md:flex md:flex-col'
    >
      {SETTINGS_NAV_ITEMS.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex min-w-0 items-center justify-center gap-1 rounded-lg border border-transparent px-1.5 py-2 text-xs font-medium whitespace-nowrap transition-colors md:w-full md:justify-start md:gap-2 md:px-3 md:text-sm',
              isActive
                ? 'border-primary/20 bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className='size-4 shrink-0' aria-hidden='true' />
            <span className='md:hidden'>{item.mobileLabel}</span>
            <span className='hidden md:inline'>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
