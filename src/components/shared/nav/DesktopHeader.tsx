'use client';

import ClerkAuthControls from '@/components/shared/ClerkAuthControls';
import type { NavItem } from '@/lib/navigation';

import BrandLogo from '../BrandLogo';
import DesktopNavigation from './DesktopNavigation';

interface DesktopHeaderProps {
  navItems: NavItem[];
}

/**
 * Desktop header component (hidden on mobile/tablet, visible on desktop).
 *
 * Layout: brand (left) | navigation (center) | auth controls (right)
 */
export default function DesktopHeader({ navItems }: DesktopHeaderProps) {
  return (
    <div className="hidden w-full items-center justify-between rounded-2xl border border-white/40 bg-white/30 px-6 py-3 shadow-lg backdrop-blur-xl lg:flex">
      {/* Brand (left) */}
      <BrandLogo />

      {/* Navigation (center) */}
      <DesktopNavigation navItems={navItems} />

      {/* Auth controls (right) */}
      <ClerkAuthControls />
    </div>
  );
}
