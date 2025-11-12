'use client';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  authenticatedNavItems,
  unauthenticatedNavItems,
} from '@/lib/navigation';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from '@clerk/nextjs';
import { Menu } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

type Props = {
  isSignedIn: boolean;
};

/**
 * Mobile navigation component with left-sliding sheet.
 *
 * Features:
 * - Hamburger trigger button (visible only on mobile/tablet)
 * - Sheet slides from left with nav items based on auth state
 * - For authenticated users, Dashboard dropdown items are shown as separate links
 * - Auto-closes when a link is clicked
 * - Shows Sign In / Sign Up buttons or UserButton based on auth state
 */
export default function MobileSiteHeader({ isSignedIn }: Props) {
  const [open, setOpen] = useState(false);

  const navItems = isSignedIn ? authenticatedNavItems : unauthenticatedNavItems;

  // Flatten navigation items for mobile (expand dashboard dropdown)
  const mobileNavItems = navItems.flatMap((item) => {
    if (item.dropdown) {
      // For dashboard with dropdown, show all items separately
      return [
        { label: item.label, href: item.href, highlight: false },
        ...item.dropdown,
      ];
    }
    return [item];
  });

  return (
    <div className="lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        {/* Hamburger trigger */}
        <Button
          variant="neutral"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Sheet content sliding from left */}
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="p-4">
            <SheetTitle>
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="text-main-foreground text-xl font-bold"
              >
                Atlaris
              </Link>
            </SheetTitle>
          </SheetHeader>

          {/* Navigation items */}
          <div className="flex flex-1 flex-col gap-3 px-4">
            {mobileNavItems.map((item) => (
              <Button
                asChild
                key={item.href}
                variant={item.highlight ? 'default' : 'neutral'}
                className="w-full justify-start"
              >
                <Link href={item.href} onClick={() => setOpen(false)}>
                  {item.label}
                </Link>
              </Button>
            ))}
          </div>

          {/* Auth controls at bottom */}
          <div className="border-border mt-auto border-t-2 p-4">
            <SignedOut>
              <div className="flex flex-col gap-2">
                <SignInButton>
                  <button className="text-ceramic-white bg-ceramic-black/50 hover:bg-ceramic-black/70 h-10 w-full cursor-pointer rounded-full px-4 text-sm font-medium">
                    Sign In
                  </button>
                </SignInButton>
                <SignUpButton>
                  <button className="text-ceramic-white h-10 w-full cursor-pointer rounded-full bg-[#6c47ff] px-4 text-sm font-medium">
                    Sign Up
                  </button>
                </SignUpButton>
              </div>
            </SignedOut>

            <SignedIn>
              <div className="flex items-center justify-center">
                <UserButton />
              </div>
            </SignedIn>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
