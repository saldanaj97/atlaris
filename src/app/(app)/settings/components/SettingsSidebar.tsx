'use client';

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
import { cn } from '@/lib/utils';

interface SettingsNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { label: 'Profile', href: '/settings/profile', icon: User },
  { label: 'Billing', href: '/settings/billing', icon: CreditCard },
  { label: 'AI Preferences', href: '/settings/ai', icon: Bot },
  { label: 'Integrations', href: '/settings/integrations', icon: Link2 },
  { label: 'Notifications', href: '/settings/notifications', icon: Bell },
];

export function SettingsSidebar(): React.ReactElement {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings" className="flex flex-col gap-1">
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
              'flex items-center gap-3 rounded-lg border border-transparent bg-sidebar px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'border-sidebar-border bg-sidebar-primary text-sidebar-primary-foreground'
                : 'text-sidebar-foreground hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
