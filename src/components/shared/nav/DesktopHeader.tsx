'use client';

import ClerkAuthControls from '@/components/shared/ClerkAuthControls';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import type { NavItem } from '@/lib/navigation';
import type { SubscriptionTier } from '@/lib/stripe/tier-limits';
import { SignedIn, SignedOut, SignInButton } from '@clerk/nextjs';
import { Plus } from 'lucide-react';
import Link from 'next/link';

import BrandLogo from '../BrandLogo';
import DesktopNavigation from './DesktopNavigation';

interface DesktopHeaderProps {
  navItems: NavItem[];
  tier?: SubscriptionTier;
  onNewPlanClick?: () => void;
}

/**
 * Desktop header component (hidden on mobile/tablet, visible on desktop).
 *
 * Layout: brand (left) | navigation (center) | auth controls (right)
 */
export default function DesktopHeader({
  navItems,
  tier,
  onNewPlanClick,
}: DesktopHeaderProps) {
  const handleNewPlanClick = () => {
    // Fire analytics event with location="nav"
    if (typeof window !== 'undefined') {
      try {
        if ('gtag' in window) {
          (
            window as typeof window & { gtag: (...args: unknown[]) => void }
          ).gtag('event', 'cta_click', {
            event_category: 'engagement',
            event_label: 'New Plan',
            cta_location: 'nav',
          });
        }
        if ('dataLayer' in window) {
          (window as typeof window & { dataLayer: unknown[] }).dataLayer.push({
            event: 'cta_click',
            ctaLocation: 'nav',
            ctaLabel: 'New Plan',
          });
        }
      } catch {
        // Silently handle analytics errors
      }
    }
    onNewPlanClick?.();
  };

  return (
    <div className="dark:bg-card-background hidden w-full grid-cols-3 items-center rounded-2xl border border-white/40 bg-black/5 px-6 py-3 shadow-lg backdrop-blur-xl lg:grid dark:border-white/10">
      {/* Brand (left) */}
      <div className="flex justify-start">
        <BrandLogo />
      </div>

      {/* Navigation (center) */}
      <div className="flex justify-center">
        <DesktopNavigation navItems={navItems} />
      </div>

      {/* Auth controls (right) */}
      <div className="flex items-center justify-end gap-3">
        <SignedIn>
          <Link
            href="/plans/new"
            onClick={handleNewPlanClick}
            className="from-primary to-accent hover:from-primary/90 hover:to-accent/90 flex items-center gap-1.5 rounded-lg bg-gradient-to-r px-3 py-1.5 text-sm font-medium text-white shadow-md transition-all hover:shadow-lg"
          >
            <Plus className="h-4 w-4" />
            <span>New Plan</span>
          </Link>
        </SignedIn>
        <SignedOut>
          <SignInButton mode="modal">
            <Button
              variant="default"
              size="sm"
              className="from-primary to-accent hover:from-primary/90 hover:to-accent/90 flex items-center gap-1.5 bg-gradient-to-r text-white"
              onClick={handleNewPlanClick}
            >
              <Plus className="h-4 w-4" />
              <span>New Plan</span>
            </Button>
          </SignInButton>
        </SignedOut>
        <ThemeToggle />
        <ClerkAuthControls tier={tier} />
      </div>
    </div>
  );
}
