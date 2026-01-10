'use client';

import ClerkAuthControls from '@/components/shared/ClerkAuthControls';
import type { NavItem } from '@/lib/navigation';
import type { SubscriptionTier } from '@/lib/stripe/tier-limits';

import BrandLogo from '../BrandLogo';
import DesktopNavigation from './DesktopNavigation';

interface DesktopHeaderProps {
  navItems: NavItem[];
  tier?: SubscriptionTier;
}

/**
 * Desktop header component (hidden on mobile/tablet, visible on desktop).
 *
 * Layout: brand (left) | navigation (center) | auth controls (right)
 */
export default function DesktopHeader({ navItems, tier }: DesktopHeaderProps) {
  return (
    <div className="hidden w-full grid-cols-3 items-center rounded-2xl border border-white/40 bg-white/30 px-6 py-3 shadow-lg backdrop-blur-xl lg:grid">
      {/* Brand (left) */}
      <div className="flex justify-start">
        <BrandLogo />
      </div>

      {/* Navigation (center) */}
      <div className="flex justify-center">
        <DesktopNavigation navItems={navItems} />
      </div>

      {/* Auth controls (right) */}
      <div className="flex justify-end">
        <ClerkAuthControls tier={tier} />
      </div>
    </div>
  );
}
