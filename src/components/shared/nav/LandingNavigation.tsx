'use client';

import Link from 'next/link';

import BrandLogo from '@/components/shared/BrandLogo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

const NAV_LINK_CLASSES =
  'text-sm font-medium text-gray-600 transition hover:text-primary focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none';

interface LandingNavigationProps {
  onCtaClick?: () => void;
}

/**
 * Minimal navigation bar for the landing page. This will only be shown on the landing page when the user is not logged in.
 * Logo + Atlaris on left, navigation links in center, primary CTA on right.
 */
export default function LandingNavigation({
  onCtaClick,
}: LandingNavigationProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav
      className="fixed start-0 top-0 z-50 w-full"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="mx-auto max-w-screen-xl px-6 py-4">
        <div className="flex items-center justify-between rounded-2xl border border-white/40 bg-white/30 px-6 py-3 shadow-lg backdrop-blur-xl">
          {/* Logo + Brand */}
          <BrandLogo />

          {/* Desktop Navigation Links */}
          <div className="hidden items-center space-x-8 md:flex">
            <Link href="#features" className={NAV_LINK_CLASSES}>
              Features
            </Link>
            <Link href="/about" className={NAV_LINK_CLASSES}>
              About
            </Link>
            <Link href="/pricing" className={NAV_LINK_CLASSES}>
              Pricing
            </Link>
            <Button
              asChild
              className="from-primary to-accent shadow-primary/25 hover:shadow-primary/30 focus-visible:ring-ring h-auto rounded-xl bg-gradient-to-r px-5 py-2.5 text-sm font-medium text-white shadow-lg transition hover:shadow-xl focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <Link href="/plans/new" onClick={onCtaClick}>
                Get Started
              </Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            className="hover:text-primary focus-visible:ring-ring rounded-md p-2 text-gray-600 hover:bg-white/40 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none md:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-menu"
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {isMobileMenuOpen ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        <div
          id="mobile-menu"
          className={cn(
            'mt-2 overflow-hidden rounded-2xl border border-white/40 bg-white/30 shadow-lg backdrop-blur-xl transition-all duration-200 ease-in-out md:hidden',
            isMobileMenuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          <div className="flex flex-col space-y-4 p-6">
            <Link
              href="#features"
              className={NAV_LINK_CLASSES}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Features
            </Link>
            <Link
              href="/about"
              className={NAV_LINK_CLASSES}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              About
            </Link>
            <Link
              href="/pricing"
              className={NAV_LINK_CLASSES}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Pricing
            </Link>
            <Button
              asChild
              className="from-primary to-accent shadow-primary/25 hover:shadow-primary/30 w-full rounded-xl bg-gradient-to-r px-5 py-2.5 text-sm font-medium text-white shadow-lg transition hover:shadow-xl"
            >
              <Link
                href="/plans/new"
                onClick={() => {
                  onCtaClick?.();
                  setIsMobileMenuOpen(false);
                }}
              >
                Get Started
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
