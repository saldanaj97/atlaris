'use client';

import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { JSX } from 'react';

import AuthControls from '@/components/shared/AuthControls';
import BrandLogo from '@/components/shared/BrandLogo';
import { mobileHeaderShellClass } from '@/components/shared/nav/header-shell';
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
  pathname: string;
  navItems: NavItem[];
  tier?: SubscriptionTier;
  isAuthenticated: boolean;
  showClerkUserButton: boolean;
}

/**
 * Compact header + hamburger when viewport below `md`. From `md` up, {@link DesktopHeader}
 * shows inline nav links instead.
 */
export default function MobileHeader({
  pathname,
  navItems,
  tier,
  isAuthenticated,
  showClerkUserButton,
}: MobileHeaderProps): JSX.Element {
  return (
    <div className={mobileHeaderShellClass(pathname)}>
      <div className='flex shrink-0'>
        <MobileNavigation pathname={pathname} navItems={navItems} />
      </div>

      <div className='flex min-w-0 items-center justify-center overflow-hidden' />

      <div className='pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center'>
        <div className='pointer-events-auto'>
          <BrandLogo size='sm' />
        </div>
      </div>

      <div className='flex min-w-0 shrink-0 items-center gap-1'>
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
                <Plus className='h-4 w-4' />
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
          />
        </div>
      </div>
    </div>
  );
}
