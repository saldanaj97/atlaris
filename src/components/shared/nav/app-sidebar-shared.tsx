import type { NavItem } from '@/features/navigation';

import { isNavItemActive } from '@/components/shared/nav/nav-active';
import { ROUTES } from '@/features/navigation';
import { cn } from '@/lib/utils';
import { BarChart3, BookOpen, LayoutDashboard, Settings } from 'lucide-react';

/** Keyboard focus ring shared by every sidebar and rail control. */
export const SIDEBAR_FOCUS_RING =
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none';

export function NavIcon({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  const Icon =
    href === ROUTES.DASHBOARD
      ? LayoutDashboard
      : href === ROUTES.PLANS.ROOT
        ? BookOpen
        : href === ROUTES.ANALYTICS.ROOT
          ? BarChart3
          : Settings;

  return (
    <Icon
      aria-hidden='true'
      className={cn(
        'size-(--at-primitive-size-icon-small,1rem) shrink-0',
        className,
      )}
    />
  );
}

export function isCurrentPath(pathname: string, item: NavItem): boolean {
  return item.dropdown
    ? pathname === item.href
    : isNavItemActive(pathname, item);
}
