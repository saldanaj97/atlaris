'use client';

import ClerkAuthControls from '@/components/shared/ClerkAuthControls';
import type { NavItem } from '@/lib/navigation';

import BrandLogo from '../BrandLogo';
import MobileNavigation from './MobileNavigation';

interface MobileHeaderProps {
  navItems: NavItem[];
}

/**
 * Mobile header bar component (visible on mobile/tablet, hidden on desktop).
 *
 * Layout: hamburger (left) | title (center) | auth controls (right)
 */
export default function MobileHeader({ navItems }: MobileHeaderProps) {
  return (
    <div className="flex w-full items-center justify-between rounded-2xl border border-white/40 bg-white/30 px-4 py-3 shadow-lg backdrop-blur-xl lg:hidden">
      {/* Left: hamburger */}
      <MobileNavigation navItems={navItems} />

      {/* Center: brand */}
      <BrandLogo size="sm" />

      {/* Right: user/auth */}
      <ClerkAuthControls />
    </div>
  );
}
