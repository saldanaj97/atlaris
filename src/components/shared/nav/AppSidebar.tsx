'use client';

import type { NavItem } from '@/features/navigation';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import BrandLogo from '@/components/shared/BrandLogo';
import { isNavItemActive } from '@/components/shared/nav/nav-active';
import { UpgradeBanner } from '@/components/ui/upgrade-banner';
import { ROUTES } from '@/features/navigation';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  LayoutDashboard,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';

interface AppSidebarProps {
  pathname: string;
  navItems: NavItem[];
  tier?: SubscriptionTier;
  userName?: string;
  navigationLabel?: string;
  className?: string;
  onNavigate?: () => void;
}

function NavIcon({ href }: { href: string }) {
  const Icon =
    href === ROUTES.DASHBOARD
      ? LayoutDashboard
      : href === ROUTES.PLANS.ROOT
        ? BookOpen
        : href === ROUTES.ANALYTICS.ROOT
          ? BarChart3
          : Settings;

  return <Icon aria-hidden='true' className='size-5 shrink-0' />;
}

function tierLabel(tier?: SubscriptionTier): string {
  if (!tier) return 'Account settings';
  return `${tier[0]!.toUpperCase()}${tier.slice(1)} Plan`;
}

function isCurrentPath(pathname: string, item: NavItem): boolean {
  return item.dropdown
    ? pathname === item.href
    : isNavItemActive(pathname, item);
}

export default function AppSidebar({
  pathname,
  navItems,
  tier,
  userName,
  navigationLabel = 'Application navigation',
  className,
  onNavigate,
}: AppSidebarProps) {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(
    {},
  );
  const idPrefix = useId();

  return (
    <aside
      aria-label='Application sidebar'
      className={cn(
        'flex min-h-full w-full flex-col bg-sidebar text-sidebar-foreground',
        className,
      )}
    >
      <div className='flex h-16 shrink-0 items-center px-4 pt-[env(safe-area-inset-top,0px)]'>
        <BrandLogo size='sm' onClick={onNavigate} />
      </div>

      <nav
        aria-label={navigationLabel}
        className='flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4'
      >
        {navItems.map((item) => {
          const isActive = isNavItemActive(pathname, item);
          const isCurrent = isCurrentPath(pathname, item);
          const isExpanded =
            expandedItems[item.href] ?? (isActive && Boolean(item.dropdown));
          const subnavId = `${idPrefix}-${item.href.replaceAll('/', '-')}-subnav`;

          return (
            <div key={item.href} className='flex flex-col'>
              <div className='flex items-center gap-1'>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={cn(
                    'group relative flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar focus-visible:outline-none',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-primary'
                      : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
                  )}
                >
                  {isActive ? (
                    <span
                      aria-hidden='true'
                      className='absolute inset-y-1 left-0.5 w-0.5 rounded-full bg-sidebar-primary'
                    />
                  ) : null}
                  <NavIcon href={item.href} />
                  <span className='min-w-0 truncate'>{item.label}</span>
                </Link>

                {item.dropdown ? (
                  <button
                    type='button'
                    aria-controls={subnavId}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${item.label}`}
                    className='flex size-[44px] shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar focus-visible:outline-none'
                    onClick={() =>
                      setExpandedItems((current) => ({
                        ...current,
                        [item.href]: !isExpanded,
                      }))
                    }
                  >
                    <ChevronDown
                      aria-hidden='true'
                      className={cn(
                        'size-4 transition-transform motion-reduce:transition-none',
                        isExpanded && 'rotate-180',
                      )}
                    />
                  </button>
                ) : null}
              </div>

              {item.dropdown && isExpanded ? (
                <div
                  id={subnavId}
                  className='ml-7 flex flex-col gap-1 border-l border-sidebar-border pl-2'
                >
                  {item.dropdown.map((subItem) => {
                    const isSubActive = isNavItemActive(pathname, subItem);
                    return (
                      <Link
                        key={subItem.href}
                        href={subItem.href}
                        onClick={onNavigate}
                        aria-current={isSubActive ? 'page' : undefined}
                        className={cn(
                          'flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm transition-colors',
                          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar focus-visible:outline-none',
                          isSubActive
                            ? 'bg-sidebar-accent text-sidebar-primary'
                            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
                        )}
                      >
                        {subItem.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className='mt-auto shrink-0 space-y-3 border-t border-sidebar-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]'>
        {tier && tier !== 'pro' ? (
          <UpgradeBanner onNavigate={onNavigate} />
        ) : null}

        <Link
          href={ROUTES.SETTINGS.PROFILE}
          onClick={onNavigate}
          aria-label='Account settings'
          className='flex min-h-[44px] items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar focus-visible:outline-none'
        >
          <span className='min-w-0'>
            <span className='block truncate font-medium text-sidebar-foreground'>
              {userName || 'Account'}
            </span>
            <span className='block truncate text-xs text-muted-foreground'>
              {tierLabel(tier)}
            </span>
          </span>
          <Settings aria-hidden='true' className='size-5 shrink-0' />
        </Link>
      </div>
    </aside>
  );
}
