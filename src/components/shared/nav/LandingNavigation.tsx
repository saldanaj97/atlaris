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
      className="fixed start-0 top-0 z-50 w-full"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="mx-auto max-w-screen-xl px-6 py-4">
        <div className="flex items-center justify-between rounded-2xl border border-white/40 bg-white/30 px-6 py-3 shadow-lg backdrop-blur-xl">
          {/* Logo + Brand */}
          <Link
            href="/"
            className="flex items-center space-x-2 rounded-md focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-400 to-pink-400 text-white shadow-lg">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <span className="bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-xl font-semibold text-transparent">
              Atlaris
            </span>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden items-center space-x-8 md:flex">
            <Link
              href="#features"
              className="text-sm font-medium text-gray-600 transition hover:text-purple-600 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Features
            </Link>
            <Link
              href="/about"
              className="text-sm font-medium text-gray-600 transition hover:text-purple-600 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              About
            </Link>
            <Link
              href="/pricing"
              className="text-sm font-medium text-gray-600 transition hover:text-purple-600 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Pricing
            </Link>
            <Button
              asChild
              className="h-auto rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-purple-500/25 transition hover:shadow-xl hover:shadow-purple-500/30 focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2"
              onClick={handleCtaClick}
            >
              <Link href="/plans/new">Get Started</Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            type="button"
            className="rounded-md p-2 text-gray-600 hover:bg-white/40 hover:text-purple-600 focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2 focus-visible:outline-none md:hidden"
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
              className="text-sm font-medium text-gray-600 transition hover:text-purple-600"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Features
            </Link>
            <Link
              href="/about"
              className="text-sm font-medium text-gray-600 transition hover:text-purple-600"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              About
            </Link>
            <Link
              href="/pricing"
              className="text-sm font-medium text-gray-600 transition hover:text-purple-600"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Pricing
            </Link>
            <Button
              asChild
              className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-purple-500/25 transition hover:shadow-xl hover:shadow-purple-500/30"
              onClick={() => {
                handleCtaClick();
                setIsMobileMenuOpen(false);
              }}
            >
              <Link href="/plans/new">Get Started</Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
