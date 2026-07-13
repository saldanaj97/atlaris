'use client';

import type { HeaderShellVariant } from '@/components/shared/nav/header-shell';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import AuthControls from '@/components/shared/AuthControls';
import BrandLogo from '@/components/shared/BrandLogo';
import HeaderLiquidGlassShell from '@/components/shared/nav/HeaderLiquidGlassShell';
import MobileNavigation from '@/components/shared/nav/MobileNavigation';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { type NavItem, ROUTES } from '@/features/navigation';
import { Plus } from 'lucide-react';
import Link from 'next/link';

interface MobileHeaderProps {
  headerVariant: HeaderShellVariant;
  pathname: string;
  navItems: NavItem[];
  tier?: SubscriptionTier;
  isAuthenticated: boolean;
  showClerkUserButton: boolean;
  userName?: string;
  userImageUrl?: string | null;
}

/**
 * Compact header + hamburger when viewport below `md`. From `md` up, {@link DesktopHeader}
 * shows inline nav links instead.
 */
export default function MobileHeader({
  headerVariant,
  pathname,
  navItems,
  tier,
  isAuthenticated,
  showClerkUserButton,
  userName,
  userImageUrl,
}: MobileHeaderProps) {
  const headerContent = (
    <>
      <div className='relative z-10 flex shrink-0'>
        <MobileNavigation
          headerVariant={headerVariant}
          pathname={pathname}
          navItems={navItems}
        />
      </div>

      <div className='relative z-10 flex min-w-0 items-center justify-center overflow-hidden' />

      <div className='pointer-events-none absolute left-1/2 z-10 flex -translate-x-1/2 items-center'>
        <div className='pointer-events-auto'>
          <BrandLogo size='sm' />
        </div>
      </div>

      <div className='relative z-10 flex min-w-0 shrink-0 items-center gap-1'>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant='ghost'
              size='icon-sm'
              className='shrink-0 text-muted-foreground hover:text-foreground'
            >
              <Link
                href={isAuthenticated ? ROUTES.PLANS.NEW : ROUTES.AUTH.SIGN_IN}
                aria-label={isAuthenticated ? 'Create new plan' : 'Sign in'}
              >
                <Plus className='size-4' />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side='bottom'>
            {isAuthenticated ? 'New plan' : 'Sign in'}
          </TooltipContent>
        </Tooltip>
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
      </div>
    </>
  );

  return (
    <HeaderLiquidGlassShell layout='mobile' variant={headerVariant}>
      {headerContent}
    </HeaderLiquidGlassShell>
  );
}
