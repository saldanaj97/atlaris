'use client';

import AuthControls from '@/components/shared/AuthControls';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import type { NavItem } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import type { SubscriptionTier } from '@/lib/stripe/tier-limits';
import { Plus } from 'lucide-react';
import Link from 'next/link';

import BrandLogo from '../BrandLogo';
import MobileNavigation from './MobileNavigation';

interface MobileHeaderProps {
  navItems: NavItem[];
  tier?: SubscriptionTier;
  isAuthenticated: boolean;
}

/**
 * Mobile header bar component (visible on mobile/tablet, hidden on desktop).
 *
 * Layout: hamburger (left) | title (center) | auth controls (right)
 */
export default function MobileHeader({
  navItems,
  tier,
  isAuthenticated,
}: MobileHeaderProps) {
  return (
    <div className="dark:bg-card-background relative grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded-2xl border border-white/40 bg-black/5 px-3 py-2.5 shadow-lg backdrop-blur-xl sm:gap-3 sm:px-4 sm:py-3 lg:hidden dark:border-white/10">
      {/* Left: hamburger */}
      <div className="flex shrink-0">
        <MobileNavigation navItems={navItems} />
      </div>

      {/* Center: placeholder to maintain grid structure */}
      <div className="flex min-w-0 items-center justify-center overflow-hidden" />

      {/* Brand logo - absolutely positioned for true centering */}
      <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center">
        <div className="pointer-events-auto">
          <BrandLogo size="sm" />
        </div>
      </div>

      {/* Right: new plan + theme toggle + user/auth */}
      <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-1.5">
        {/* New Plan quick action */}
        <Link
          href={isAuthenticated ? ROUTES.PLANS.NEW : '/auth/sign-in'}
          className="from-primary to-accent focus-visible:ring-ring focus-visible:ring-offset-card flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r text-white shadow-md transition-shadow hover:shadow-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:h-9 sm:w-9 sm:rounded-xl"
          aria-label={isAuthenticated ? 'Create new plan' : 'Sign in'}
        >
          <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
        </Link>
        <div className="shrink-0">
          <ThemeToggle size="icon-sm" />
        </div>
        <div className="min-w-0 shrink-0">
          <AuthControls
            isAuthenticated={isAuthenticated}
            tier={isAuthenticated ? tier : undefined}
          />
        </div>
      </div>
    </div>
  );
}
