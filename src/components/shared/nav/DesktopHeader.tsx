'use client';

import type { HeaderShellVariant } from '@/components/shared/nav/header-shell';
import type { NavItem } from '@/features/navigation';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import AuthControls from '@/components/shared/AuthControls';
import BrandLogo from '@/components/shared/BrandLogo';
import DesktopNavigation from '@/components/shared/nav/DesktopNavigation';
import HeaderLiquidGlassShell from '@/components/shared/nav/HeaderLiquidGlassShell';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

interface DesktopHeaderProps {
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
 * Desktop header (visible from `md` up). Below `md`, {@link MobileHeader} renders.
 *
 * Layout: brand (left) | navigation (center) | auth controls (right)
 */
export default function DesktopHeader({
  headerVariant,
  pathname,
  navItems,
  tier,
  isAuthenticated,
  showClerkUserButton,
  userName,
  userImageUrl,
}: DesktopHeaderProps) {
  const headerContent = (
    <>
      {/* Brand (left) */}
      <div className='relative z-10 flex min-w-0 items-center justify-self-start'>
        <BrandLogo />
      </div>

      {/* Navigation (center column) */}
      <div className='relative z-10 flex justify-self-center'>
        <DesktopNavigation pathname={pathname} navItems={navItems} />
      </div>

      {/* Auth controls (right) */}
      <div className='relative z-10 flex min-w-0 items-center justify-end gap-2 justify-self-end'>
        <Button
          variant='ghost'
          size='sm'
          className='gap-1.5 text-muted-foreground hover:text-foreground'
          asChild
        >
          <Link
            href={isAuthenticated ? '/plans/new' : '/auth/sign-in'}
            aria-label='New Plan'
          >
            <Plus className='size-3.5' aria-hidden='true' />
            <span className='hidden lg:inline'>New Plan</span>
          </Link>
        </Button>

        <ThemeToggle withTooltip />

        <AuthControls
          isAuthenticated={isAuthenticated}
          tier={isAuthenticated ? tier : undefined}
          showClerkUserButton={showClerkUserButton}
          userName={userName}
          userImageUrl={userImageUrl}
        />
      </div>
    </>
  );

  return (
    <HeaderLiquidGlassShell layout='desktop' variant={headerVariant}>
      {headerContent}
    </HeaderLiquidGlassShell>
  );
}
