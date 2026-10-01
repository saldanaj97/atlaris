'use client';

import type { CreatePlanCta, NavItem } from '@/features/navigation';

import { AccountAvatar } from '@/components/shared/AccountAvatar';
import {
  isCurrentPath,
  NavIcon,
  SIDEBAR_FOCUS_RING,
} from '@/components/shared/nav/app-sidebar-shared';
import {
  DESKTOP_SIDEBAR_EXPAND_CONTROL_ID,
  DESKTOP_SIDEBAR_EXPAND_LABEL,
} from '@/components/shared/nav/desktop-sidebar-state';
import { isNavItemActive } from '@/components/shared/nav/nav-active';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ROUTES } from '@/features/navigation';
import { cn } from '@/lib/utils';
import { UserButton } from '@clerk/nextjs';
import { CircleArrowUp, ChevronRight, Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

interface AppSidebarRailProps {
  id?: string;
  pathname: string;
  navItems: NavItem[];
  navigationLabel: string;
  createPlanCta: CreatePlanCta | null;
  userName?: string;
  userImageUrl?: string | null;
  showClerkUserButton: boolean;
  onDesktopExpand?: () => void;
}

const RAIL_CONTROL =
  'flex shrink-0 items-center justify-center rounded-sm transition-colors motion-reduce:transition-none';
const RAIL_ITEM = `${RAIL_CONTROL} size-[36px] pointer-coarse:size-(--at-semantic-size-control-touch,2.75rem)`;
const RAIL_FOOTER_ITEM = `${RAIL_CONTROL} size-[44px]`;

/** Desktop-only 4rem icon rail. Renders the content of the collapsed sidebar. */
export default function AppSidebarRail({
  id,
  pathname,
  navItems,
  navigationLabel,
  createPlanCta,
  userName,
  userImageUrl,
  showClerkUserButton,
  onDesktopExpand,
}: AppSidebarRailProps) {
  const isUpgradeCta = createPlanCta?.href === ROUTES.PRICING;

  return (
    <>
      <div className='flex h-(--at-semantic-layout-header-min,4rem) shrink-0 items-center justify-center pt-[env(safe-area-inset-top,0px)]'>
        {/* The mark and the expand control share one slot; the expand control
            replaces the mark while the sidebar is hovered or focused. */}
        <div className='relative size-[32px] pointer-coarse:size-(--at-semantic-size-control-touch,2.75rem)'>
          <Link
            href={ROUTES.DASHBOARD}
            aria-label='Atlaris home'
            className={cn(
              'absolute inset-0 flex items-center justify-center rounded-sm opacity-100 scale-100 transition-all duration-(--motion-duration-feedback) ease-(--motion-easing-standard) motion-reduce:transition-none',
              'group-focus-within/sidebar:pointer-events-none group-focus-within/sidebar:scale-85 group-focus-within/sidebar:opacity-0 group-hover/sidebar:pointer-events-none group-hover/sidebar:scale-85 group-hover/sidebar:opacity-0 [@media(hover:none)]:pointer-events-none [@media(hover:none)]:opacity-0',
              SIDEBAR_FOCUS_RING,
            )}
          >
            <Image
              src='/brand/mark-on-light.svg'
              alt=''
              aria-hidden='true'
              width={24}
              height={24}
              className='size-[24px] dark:hidden'
            />
            <Image
              src='/brand/mark-on-dark.svg'
              alt=''
              aria-hidden='true'
              width={24}
              height={24}
              className='hidden size-[24px] dark:block'
            />
          </Link>
          <button
            id={DESKTOP_SIDEBAR_EXPAND_CONTROL_ID}
            type='button'
            aria-controls={id}
            aria-expanded='false'
            aria-label={DESKTOP_SIDEBAR_EXPAND_LABEL}
            className={cn(
              'group/expand pointer-events-none absolute inset-0 flex items-center justify-center rounded-full opacity-0 scale-85 transition-all duration-(--motion-duration-feedback) ease-(--motion-easing-standard) motion-reduce:transition-none',
              'group-focus-within/sidebar:pointer-events-auto group-focus-within/sidebar:scale-100 group-focus-within/sidebar:opacity-100 group-hover/sidebar:pointer-events-auto group-hover/sidebar:scale-100 group-hover/sidebar:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:scale-100 [@media(hover:none)]:opacity-100',
              SIDEBAR_FOCUS_RING,
            )}
            onClick={onDesktopExpand}
          >
            <span
              aria-hidden='true'
              className='flex size-[24px] items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors group-hover/expand:border-input group-hover/expand:bg-secondary group-hover/expand:text-foreground motion-reduce:transition-none'
            >
              <ChevronRight className='size-[14px]' />
            </span>
          </button>
        </div>
      </div>

      <nav
        aria-label={navigationLabel}
        className='flex shrink-0 flex-col items-center gap-(--at-primitive-space-0-5,0.125rem) pt-(--at-primitive-space-2,0.5rem)'
      >
        {navItems.map((item) => {
          const isActive = isNavItemActive(pathname, item);
          const isCurrent = isCurrentPath(pathname, item);

          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={cn(
                    RAIL_ITEM,
                    SIDEBAR_FOCUS_RING,
                    isActive
                      ? 'bg-action-soft text-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  <NavIcon
                    href={item.href}
                    className={cn('size-[18px]', isActive && 'text-link')}
                  />
                </Link>
              </TooltipTrigger>
              <TooltipContent side='right'>{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      {createPlanCta ? (
        <div className='flex shrink-0 justify-center pt-(--at-primitive-space-4,1rem)'>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                size='icon'
                aria-label={createPlanCta.label}
                className='size-[36px]'
              >
                <Link href={createPlanCta.href}>
                  {isUpgradeCta ? (
                    <CircleArrowUp aria-hidden='true' />
                  ) : (
                    <Plus aria-hidden='true' />
                  )}
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side='right'>{createPlanCta.label}</TooltipContent>
          </Tooltip>
        </div>
      ) : null}

      <div className='flex-1' />

      <div className='flex shrink-0 flex-col items-center gap-(--at-primitive-space-1,0.25rem) py-(--at-primitive-space-3,0.75rem) pb-[max(0.75rem,env(safe-area-inset-bottom))]'>
        <ThemeToggle
          size='icon-sm'
          withTooltip
          tooltipSide='right'
          className='text-muted-foreground hover:bg-secondary hover:text-foreground'
        />

        {showClerkUserButton ? (
          <div className={RAIL_FOOTER_ITEM}>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: 'size-9',
                  userButtonTrigger:
                    'size-9 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [@media(pointer:coarse)]:size-11',
                },
              }}
            />
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={ROUTES.SETTINGS.PROFILE}
                aria-label='Account settings'
                className={cn(
                  RAIL_FOOTER_ITEM,
                  'hover:bg-secondary',
                  SIDEBAR_FOCUS_RING,
                )}
              >
                <AccountAvatar
                  userName={userName}
                  userImageUrl={userImageUrl}
                  className='size-[28px]'
                />
              </Link>
            </TooltipTrigger>
            <TooltipContent side='right'>Account settings</TooltipContent>
          </Tooltip>
        )}
      </div>
    </>
  );
}
