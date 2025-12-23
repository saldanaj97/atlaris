'use client';

import Link from 'next/link';
import ClerkAuthControls from '@/components/shared/ClerkAuthControls';
import type { NavItem } from '@/lib/navigation';

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
    <div className="relative flex w-full items-center lg:hidden">
      {/* Left: hamburger */}
      <MobileNavigation navItems={navItems} />

      {/* Center: title */}
      <Link
        href="/"
        className="text-main-foreground absolute left-1/2 -translate-x-1/2 text-xl font-bold"
      >
        Atlaris
      </Link>

      {/* Right: user/auth */}
      <ClerkAuthControls />
    </div>
  );
}
