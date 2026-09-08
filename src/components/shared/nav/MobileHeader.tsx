'use client';

import type { SubscriptionTier } from '@/shared/types/billing.types';

import AuthControls from '@/components/shared/AuthControls';
import BrandLogo from '@/components/shared/BrandLogo';
import { marketingHeaderPrimaryCtaClassName } from '@/components/shared/nav/marketing-header-classes';
import MobileNavigation from '@/components/shared/nav/MobileNavigation';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  type NavItem,
  resolveCreatePlanCta,
  ROUTES,
} from '@/features/navigation';
import { cn } from '@/lib/utils';
import { ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';

interface MobileHeaderProps {
  isMarketing: boolean;
  /** App-shell routes keep the drawer trigger in this topbar. */
  isAppShell?: boolean;
  pathname: string;
  navItems: NavItem[];
  tier?: SubscriptionTier;
  canCreatePlan?: boolean;
  isAuthenticated: boolean;
  showClerkUserButton: boolean;
  userName?: string;
  userImageUrl?: string | null;
}

/**
 * Compact header + hamburger when viewport below `md`. From `md` up, {@link DesktopHeader}
 * shows inline nav links instead.
 *
 * Marketing routes: brand + menu + theme toggle + peach CTA (no app avatar chrome).
 */
export default function MobileHeader({
  isMarketing,
  isAppShell = false,
  pathname,
  navItems,
  tier,
  canCreatePlan,
  isAuthenticated,
  showClerkUserButton,
  userName,
  userImageUrl,
}: MobileHeaderProps) {
  const primaryCtaHref = isAuthenticated
    ? ROUTES.DASHBOARD
    : ROUTES.AUTH.SIGN_IN;
  const primaryCtaLabel = isAuthenticated ? 'Dashboard' : 'Begin tonight';
  const createPlanCta = resolveCreatePlanCta({
    isAuthenticated,
    canCreatePlan,
    createLabel: 'New plan',
  });
  const appCtaAriaLabel =
    createPlanCta?.label === 'Upgrade' ? 'Upgrade' : 'Create new plan';

  return (
    <div
      className={cn(
        'relative grid h-[64px] w-full grid-cols-[auto_1fr_auto] items-center gap-2',
        isAppShell ? 'lg:hidden' : 'md:hidden',
      )}
    >
      <div className='relative z-10 flex shrink-0'>
        <MobileNavigation
          isMarketing={isMarketing}
          isAppShell={isAppShell}
          pathname={pathname}
          navItems={navItems}
          tier={tier}
          canCreatePlan={canCreatePlan}
          isAuthenticated={isAuthenticated}
          userName={userName}
        />
      </div>

      <div className='relative z-10 flex min-w-0 items-center justify-center overflow-hidden'>
        <BrandLogo size='sm' />
      </div>

      <div className='relative z-10 flex min-w-0 shrink-0 items-center gap-1'>
        {isMarketing ? (
          <>
            <div className='shrink-0'>
              <ThemeToggle size='icon-sm' withTooltip />
            </div>
            <Button
              asChild
              size='sm'
              className={cn(
                marketingHeaderPrimaryCtaClassName,
                'px-3 py-1.5 text-xs',
              )}
            >
              <Link href={primaryCtaHref}>
                {primaryCtaLabel}
                <ArrowRight
                  aria-hidden='true'
                  className='size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none'
                />
              </Link>
            </Button>
          </>
        ) : (
          <>
            {createPlanCta ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    asChild
                    variant='ghost'
                    size='icon-sm'
                    className='shrink-0 text-muted-foreground hover:text-foreground'
                  >
                    <Link
                      href={createPlanCta.href}
                      aria-label={appCtaAriaLabel}
                    >
                      <Plus className='size-4' />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side='bottom'>
                  {createPlanCta.label}
                </TooltipContent>
              </Tooltip>
            ) : null}
            <div className='shrink-0'>
              <ThemeToggle size='icon-sm' withTooltip />
            </div>
            <div className='min-w-0 shrink-0'>
              <AuthControls
                isAuthenticated={isAuthenticated}
                tier={isAuthenticated ? tier : undefined}
                showClerkUserButton={showClerkUserButton}
                userName={userName}
                userImageUrl={userImageUrl}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
