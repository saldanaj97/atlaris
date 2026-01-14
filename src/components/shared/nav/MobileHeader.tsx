'use client';

import ClerkAuthControls from '@/components/shared/ClerkAuthControls';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import type { NavItem } from '@/lib/navigation';
import type { SubscriptionTier } from '@/lib/stripe/tier-limits';

import BrandLogo from '../BrandLogo';
import MobileNavigation from './MobileNavigation';

interface MobileHeaderProps {
  navItems: NavItem[];
  tier?: SubscriptionTier;
}

/**
 * Mobile header bar component (visible on mobile/tablet, hidden on desktop).
 *
 * Layout: hamburger (left) | title (center) | auth controls (right)
 */
export default function MobileHeader({ navItems, tier }: MobileHeaderProps) {
  return (
    <div className="dark:bg-card-background grid w-full grid-cols-3 items-center justify-items-center rounded-2xl border border-white/40 bg-black/5 px-4 py-3 shadow-lg backdrop-blur-xl lg:hidden dark:border-white/10">
      {/* Left: hamburger */}
      <div className="justify-self-start">
        <MobileNavigation navItems={navItems} />
      </div>

      {/* Center: brand */}
      <BrandLogo size="sm" />

      {/* Right: theme toggle + user/auth */}
      <div className="flex items-center gap-1 justify-self-end">
        <ThemeToggle size="icon-sm" />
        <ClerkAuthControls tier={tier} />
      </div>
    </div>
  );
}
