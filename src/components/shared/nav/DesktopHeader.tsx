'use client';

import ClerkAuthControls from '@/components/shared/ClerkAuthControls';
import type { NavItem } from '@/lib/navigation';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';

import DesktopNavigation from './DesktopNavigation';

interface DesktopHeaderProps {
  navItems: NavItem[];
}

/**
 * Desktop header component (hidden on mobile/tablet, visible on desktop).
 *
 * Layout: brand (left) | navigation (center) | auth controls (right)
 * Uses CSS grid with 3 columns for proper alignment.
 */
export default function DesktopHeader({ navItems }: DesktopHeaderProps) {
  return (
    <div className="hidden lg:grid lg:grid-cols-3 lg:items-center">
      {/* Brand (left) */}
      <Link href="/" className="flex items-center space-x-2">
        <BookOpen className="text-main h-8 w-8" />
        <span className="text-main-foreground text-2xl font-bold">Atlaris</span>
      </Link>

      {/* Navigation (center) */}
      <div className="justify-self-center">
        <DesktopNavigation navItems={navItems} />
      </div>

      {/* Auth controls (right) */}
      <div className="justify-self-end">
        <ClerkAuthControls />
      </div>
    </div>
  );
}
