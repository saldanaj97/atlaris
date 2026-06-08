'use client';

import type { NavItem } from '@/features/navigation';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import AuthControls from '@/components/shared/AuthControls';
import BrandLogo from '@/components/shared/BrandLogo';
import DesktopNavigation from '@/components/shared/nav/DesktopNavigation';
import { desktopHeaderShellClass } from '@/components/shared/nav/header-shell';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Plus } from 'lucide-react';
import Link from 'next/link';

interface DesktopHeaderProps {
  pathname: string;
  navItems: NavItem[];
  tier?: SubscriptionTier;
  isAuthenticated: boolean;
  showClerkUserButton: boolean;
}

/**
 * Desktop header (visible from `md` up). Below `md`, {@link MobileHeader} renders.
 *
 * Layout: brand (left) | navigation (center) | auth controls (right)
 */
export default function DesktopHeader({
  pathname,
  navItems,
  tier,
  isAuthenticated,
  showClerkUserButton,
}: DesktopHeaderProps) {
  return (
    <div className={desktopHeaderShellClass(pathname)}>
      {/* Brand (left) */}
      <div className='flex items-center'>
        <BrandLogo />
      </div>

      {/* Navigation (center) */}
      <div className='flex justify-center'>
        <DesktopNavigation pathname={pathname} navItems={navItems} />
      </div>

      {/* Auth controls (right) */}
      <div className='flex items-center justify-end gap-1'>
        <Button
          variant='ghost'
          size='sm'
          className='gap-1.5 text-muted-foreground hover:text-foreground'
          asChild
        >
          <Link href={isAuthenticated ? '/plans/new' : '/auth/sign-in'}>
            <Plus className='size-3.5' />
            <span>New Plan</span>
          </Link>
        </Button>

        <ThemeToggle withTooltip />

        <Separator orientation='vertical' className='mx-1 h-5' />

        <AuthControls
          isAuthenticated={isAuthenticated}
          tier={isAuthenticated ? tier : undefined}
          showClerkUserButton={showClerkUserButton}
        />
      </div>
    </div>
  );
}
