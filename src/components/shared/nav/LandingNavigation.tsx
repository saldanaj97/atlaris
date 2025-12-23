'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

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

  const handleCtaClick = () => {
    onCtaClick?.();
  };

  return (
    <nav
      className="fixed top-0 right-0 left-0 z-50 border-b border-slate-200 bg-[#FAF9F7]/95 backdrop-blur-sm"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo + Brand */}
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <AtlarisLogo className="h-8 w-8" />
            <span className="text-xl font-semibold text-slate-900">
              Atlaris
            </span>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden items-center gap-8 md:flex">
            <Link
              href="#how-it-works"
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              How it Works
            </Link>
            <Link
              href="/pricing"
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Pricing
            </Link>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Log In
            </Link>
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:block">
            <Button
              asChild
              className="bg-slate-700 px-5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2"
              onClick={handleCtaClick}
            >
              <Link href="/plans/new">Build My Schedule</Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2 focus-visible:outline-none md:hidden"
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
            'overflow-hidden transition-all duration-200 ease-in-out md:hidden',
            isMobileMenuOpen ? 'max-h-64 pb-4' : 'max-h-0'
          )}
        >
          <div className="flex flex-col gap-4 pt-4">
            <Link
              href="#how-it-works"
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              How it Works
            </Link>
            <Link
              href="/pricing"
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Pricing
            </Link>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Log In
            </Link>
            <Button
              asChild
              className="mt-2 w-full bg-slate-700 text-white hover:bg-slate-800"
              onClick={() => {
                handleCtaClick();
                setIsMobileMenuOpen(false);
              }}
            >
              <Link href="/plans/new">Build My Schedule</Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}

/** Simple geometric logo mark for Atlaris */
function AtlarisLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx="6"
        fill="#334155"
        stroke="#1e293b"
        strokeWidth="1.5"
      />
      <path
        d="M10 22L16 10L22 22"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 18H20"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
