'use client';

import type { NavItem } from '@/features/navigation';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  ACCOUNT_USER_BUTTON_APPEARANCE,
  AccountAvatar,
} from '@/components/shared/AccountAvatar';
import BrandLogo from '@/components/shared/BrandLogo';
import {
  isCurrentPath,
  NavIcon,
  SIDEBAR_FOCUS_RING,
} from '@/components/shared/nav/app-sidebar-shared';
import AppSidebarRail from '@/components/shared/nav/AppSidebarRail';
import {
  DESKTOP_SIDEBAR_COLLAPSE_CONTROL_ID,
  DESKTOP_SIDEBAR_COLLAPSE_LABEL,
} from '@/components/shared/nav/desktop-sidebar-state';
import { isNavItemActive } from '@/components/shared/nav/nav-active';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import { resolveCreatePlanCta, ROUTES } from '@/features/navigation';
import { cn } from '@/lib/utils';
import { UserButton } from '@clerk/nextjs';
import { ChevronDown, ChevronLeft, Plus } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';

interface AppSidebarProps {
  pathname: string;
  navItems: NavItem[];
  tier?: SubscriptionTier;
  /** Entitlement for the Create plan action; hidden while unknown. */
  canCreatePlan?: boolean;
  userName?: string;
  userImageUrl?: string | null;
  showClerkUserButton?: boolean;
  navigationLabel?: string;
  className?: string;
  id?: string;
  /** Desktop icon rail. Never set for the mobile sheet. */
  collapsed?: boolean;
  onNavigate?: () => void;
  onDesktopCollapse?: () => void;
  onDesktopExpand?: () => void;
}

/** Row geometry shared by nav destinations and their sub-items. */
const NAV_ROW =
  'min-h-[36px] rounded-sm px-[12px] type-label transition-colors motion-reduce:transition-none pointer-coarse:min-h-(--at-semantic-size-control-touch,2.75rem)';
const NAV_ROW_IDLE =
  'text-muted-foreground hover:bg-secondary hover:text-foreground';
const NAV_ROW_SELECTED = 'bg-action-soft text-foreground';
/** Left bar on the active top-level destination; matches the collapsed rail. */
const NAV_ROW_MARKER =
  'relative before:absolute before:inset-y-[8px] before:left-0 before:w-[3px] before:rounded-full before:bg-link';

function tierLabel(tier: SubscriptionTier): string {
  return `${tier[0]!.toUpperCase()}${tier.slice(1)} plan`;
}

export default function AppSidebar({
  pathname,
  navItems,
  tier,
  canCreatePlan,
  userName,
  userImageUrl,
  showClerkUserButton = false,
  navigationLabel = 'Application navigation',
  className,
  id,
  collapsed = false,
  onNavigate,
  onDesktopCollapse,
  onDesktopExpand,
}: AppSidebarProps) {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(
    {},
  );
  const idPrefix = useId();
  const tierTitleId = `${idPrefix}-tier-title`;
  const showUpgrade = Boolean(tier && tier !== 'pro');
  const createPlanCta = resolveCreatePlanCta({
    canCreatePlan,
    createLabel: 'Create plan',
  });
  // The desktop sidebar animates its width; keep the expanded layout from
  // reflowing while the aside is narrower than its final width.
  const expandedMinWidth = onDesktopCollapse
    ? 'min-w-[calc(var(--at-semantic-layout-sidebar,14rem)-1px)]'
    : undefined;

  return (
    <aside
      id={id}
      aria-label='Application sidebar'
      className={cn(
        'group/sidebar flex min-h-full w-full flex-col bg-background text-foreground',
        className,
      )}
    >
      {collapsed ? (
        <AppSidebarRail
          id={id}
          pathname={pathname}
          navItems={navItems}
          navigationLabel={navigationLabel}
          createPlanCta={createPlanCta}
          userName={userName}
          userImageUrl={userImageUrl}
          showClerkUserButton={showClerkUserButton}
          onDesktopExpand={onDesktopExpand}
        />
      ) : (
        <>
          <div
            className={cn(
              'flex h-(--at-semantic-layout-header-min,4rem) shrink-0 items-center gap-2 pt-[env(safe-area-inset-top,0px)] pr-(--at-primitive-space-3,0.75rem) pl-(--at-primitive-space-5,1.25rem)',
              expandedMinWidth,
            )}
          >
            <div className='flex min-w-0 flex-1 items-center'>
              <BrandLogo
                size='sm'
                href={ROUTES.DASHBOARD}
                onClick={onNavigate}
              />
            </div>
            {onDesktopCollapse ? (
              <button
                id={DESKTOP_SIDEBAR_COLLAPSE_CONTROL_ID}
                type='button'
                aria-controls={id}
                aria-label={DESKTOP_SIDEBAR_COLLAPSE_LABEL}
                className={cn(
                  'flex size-[32px] shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground motion-reduce:transition-none pointer-coarse:size-(--at-semantic-size-control-touch,2.75rem)',
                  SIDEBAR_FOCUS_RING,
                )}
                onClick={onDesktopCollapse}
              >
                <ChevronLeft
                  aria-hidden='true'
                  className='size-(--at-primitive-size-icon-small,1rem)'
                />
              </button>
            ) : null}
          </div>

          <nav
            aria-label={navigationLabel}
            className={cn(
              'flex min-h-0 shrink flex-col gap-(--at-primitive-space-0-5,0.125rem) overflow-y-auto px-(--at-primitive-space-3,0.75rem) pt-(--at-primitive-space-2,0.5rem)',
              expandedMinWidth,
            )}
          >
            {navItems.map((item) => {
              const isActive = isNavItemActive(pathname, item);
              const isCurrent = isCurrentPath(pathname, item);
              const isExpanded =
                expandedItems[item.href] ??
                (isActive && Boolean(item.dropdown));
              const subnavId = `${idPrefix}-${item.href.replaceAll('/', '-')}-subnav`;

              return (
                <div key={item.href} className='flex flex-col'>
                  <div className='flex items-center gap-1'>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isCurrent ? 'page' : undefined}
                      className={cn(
                        'group flex min-w-0 flex-1 items-center gap-(--at-primitive-space-3,0.75rem) font-medium',
                        NAV_ROW,
                        SIDEBAR_FOCUS_RING,
                        isActive
                          ? cn(NAV_ROW_SELECTED, NAV_ROW_MARKER)
                          : NAV_ROW_IDLE,
                      )}
                    >
                      <NavIcon
                        href={item.href}
                        className={cn(isActive && 'text-link')}
                      />
                      <span className='min-w-0 wrap-anywhere'>
                        {item.label}
                      </span>
                    </Link>

                    {item.dropdown ? (
                      <button
                        type='button'
                        aria-controls={subnavId}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${item.label}`}
                        className={cn(
                          'flex size-[36px] shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground motion-reduce:transition-none pointer-coarse:size-(--at-semantic-size-control-touch,2.75rem)',
                          SIDEBAR_FOCUS_RING,
                        )}
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
                            'size-(--at-primitive-size-icon-small,1rem) transition-transform motion-reduce:transition-none',
                            isExpanded && 'rotate-180',
                          )}
                        />
                      </button>
                    ) : null}
                  </div>

                  {item.dropdown && isExpanded ? (
                    <div
                      id={subnavId}
                      className='ml-7 flex flex-col gap-1 border-l border-border pl-2'
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
                              'flex items-center font-medium',
                              NAV_ROW,
                              SIDEBAR_FOCUS_RING,
                              isSubActive ? NAV_ROW_SELECTED : NAV_ROW_IDLE,
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

          {createPlanCta ? (
            <div
              className={cn(
                'px-(--at-primitive-space-3,0.75rem) pt-(--at-primitive-space-4,1rem)',
                expandedMinWidth,
              )}
            >
              <Button asChild className='min-h-[36px] w-full'>
                <Link href={createPlanCta.href} onClick={onNavigate}>
                  {createPlanCta.href === ROUTES.PLANS.NEW ? (
                    <Plus
                      aria-hidden='true'
                      className='size-(--at-primitive-size-icon-small,1rem)'
                    />
                  ) : null}
                  {createPlanCta.label}
                </Link>
              </Button>
            </div>
          ) : null}

          <div className='flex-1' />

          <div
            className={cn(
              'flex shrink-0 flex-col gap-[8px] pt-(--at-primitive-space-3,0.75rem) pr-(--at-primitive-space-3,0.75rem) pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[12px]',
              expandedMinWidth,
            )}
          >
            {tier && showUpgrade ? (
              <section
                aria-labelledby={tierTitleId}
                className='flex flex-col items-start gap-(--at-primitive-space-1,0.25rem) rounded-md border border-border bg-card p-(--at-primitive-space-3,0.75rem)'
              >
                <p id={tierTitleId} className='type-label text-foreground'>
                  {tierLabel(tier)}
                </p>
                <p className='type-meta text-muted-foreground'>
                  Pro unlocks more learning plans and features.
                </p>
                <Link
                  href={ROUTES.PRICING}
                  onClick={onNavigate}
                  className={cn(
                    'mt-(--at-primitive-space-1,0.25rem) inline-flex items-center rounded-sm type-label text-link underline underline-offset-3 transition-colors hover:text-link-hover motion-reduce:transition-none pointer-coarse:min-h-(--at-semantic-size-control-touch,2.75rem)',
                    SIDEBAR_FOCUS_RING,
                  )}
                >
                  Upgrade to Pro
                </Link>
              </section>
            ) : null}

            <div className='flex items-center gap-(--at-primitive-space-1,0.25rem)'>
              {showClerkUserButton ? (
                <div className='flex h-[44px] min-w-0 flex-1 items-center gap-(--at-primitive-space-1-5,0.375rem) px-(--at-primitive-space-1-5,0.375rem)'>
                  <UserButton appearance={ACCOUNT_USER_BUTTON_APPEARANCE} />
                  <span className='min-w-0 flex-1 truncate type-label text-foreground'>
                    {userName || 'Account'}
                  </span>
                </div>
              ) : (
                <Link
                  href={ROUTES.SETTINGS.PROFILE}
                  onClick={onNavigate}
                  className={cn(
                    'flex h-[44px] min-w-0 flex-1 items-center gap-(--at-primitive-space-1-5,0.375rem) rounded-sm px-(--at-primitive-space-1-5,0.375rem) type-body transition-colors hover:bg-secondary motion-reduce:transition-none pointer-coarse:min-h-(--at-semantic-size-control-touch,2.75rem)',
                    SIDEBAR_FOCUS_RING,
                  )}
                >
                  <AccountAvatar
                    userName={userName}
                    userImageUrl={userImageUrl}
                    className='size-[28px]'
                  />
                  <span className='min-w-0 flex-1 truncate type-label text-foreground'>
                    {userName || 'Account'}
                  </span>
                  <span className='sr-only'>, account settings</span>
                </Link>
              )}
              {onDesktopCollapse ? (
                <ThemeToggle
                  size='icon-sm'
                  withTooltip
                  tooltipSide='top'
                  className='shrink-0 text-muted-foreground hover:bg-secondary hover:text-foreground'
                />
              ) : null}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
