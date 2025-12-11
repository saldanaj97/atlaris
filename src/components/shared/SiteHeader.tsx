import AuthControls from '@/components/shared/AuthControls';
import MobileSiteHeader from '@/components/shared/MobileSiteHeader';
import { Paper } from '@/components/shared/Paper';
import SiteHeaderClient from '@/components/shared/SiteHeaderClient';
import { getEffectiveClerkUserId } from '@/lib/api/auth';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';

/**
 * Server component wrapper for the client-side header.
 *
 * Responsibilities:
 * - Resolve whether a user is signed in (server-side) and pass that
 *   boolean down to the client component so it can render auth controls
 *   (Sign In / Sign Up / UserButton) and filter nav items that require
 *   authentication.
 *
 */
export default async function SiteHeader() {
  const clerkUserId = await getEffectiveClerkUserId();

  return (
    <header className="container mx-auto my-4 w-full">
      <Paper className="flex items-center justify-between gap-4 p-4 lg:grid lg:grid-cols-3 lg:items-center">
        {/* Desktop brand (left) */}
        <Link href="/" className="hidden items-center space-x-2 lg:flex">
          <BookOpen className="text-main h-8 w-8" />
          <span className="text-main-foreground text-2xl font-bold">
            Atlaris
          </span>
        </Link>

        {/* Mobile header bar: hamburger left, title centered, auth right */}
        <div className="relative flex w-full items-center lg:hidden">
          {/* Left: hamburger */}
          <MobileSiteHeader isSignedIn={Boolean(clerkUserId)} />

          {/* Center: title */}
          <Link
            href="/"
            className="text-main-foreground absolute left-1/2 -translate-x-1/2 text-xl font-bold"
          >
            Atlaris
          </Link>

          {/* Right: user/auth */}
          <AuthControls />
        </div>

        {/* Desktop navigation + auth (centered nav, auth on right) */}
        <div className="hidden w-full lg:block lg:justify-self-center">
          <SiteHeaderClient isSignedIn={Boolean(clerkUserId)} />
        </div>

        {/* Desktop auth controls (right) */}
        <div className="hidden lg:flex lg:justify-self-end">
          <AuthControls />
        </div>
      </Paper>
    </header>
  );
}
