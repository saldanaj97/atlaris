'use client';

import { cn } from '@/lib/utils';
import {
  Bell,
  Bot,
  CreditCard,
  Link2,
  User,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SettingsNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const settingsNavItems: SettingsNavItem[] = [
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
      {settingsNavItems.map((item) => {
        const isActive = pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary dark:bg-primary/20'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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
