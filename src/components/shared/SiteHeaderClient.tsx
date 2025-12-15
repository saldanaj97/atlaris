'use client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  authenticatedNavItems,
  unauthenticatedNavItems,
  type NavItem,
} from '@/lib/navigation';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';

/**
 * Desktop navigation and auth controls for the site header.
 *
 * Features:
 * - Center-aligned navigation with different items based on auth state
 * - Authenticated: Explore, Dashboard (dropdown), Integrations
 * - Unauthenticated: Explore, Pricing, About
 * - Dashboard is clickable and has a dropdown menu
 * - Right-aligned auth controls (Sign In/Sign Up or UserButton)
 * - Mobile navigation is delegated to MobileSiteHeader component
 */
export default function SiteHeaderClient({
  isSignedIn,
}: {
  isSignedIn: boolean;
}) {
  const navItems = isSignedIn ? authenticatedNavItems : unauthenticatedNavItems;

  const renderNavItem = (item: NavItem) => {
    // Item with dropdown (Dashboard)
    if (item.dropdown) {
      return (
        <DropdownMenu key={item.href}>
          <DropdownMenuTrigger asChild>
            <Button variant="nav-button" className="gap-1">
              <span className="text-sm sm:text-base">{item.label}</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[160px]">
            {item.dropdown.map((dropdownItem) => (
              <DropdownMenuItem key={dropdownItem.href} asChild>
                <Link
                  href={dropdownItem.href}
                  className={
                    dropdownItem.highlight ? 'text-main font-medium' : undefined
                  }
                >
                  {dropdownItem.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    // Regular nav item
    return (
      <Button
        asChild
        key={item.href}
        variant="nav-button"
        className={item.highlight ? 'bg-main text-main-foreground' : undefined}
      >
        <Link href={item.href} className="text-sm sm:text-base">
          {item.label}
        </Link>
      </Button>
    );
  };

  return (
    <nav className="hidden items-center lg:flex">
      <div className="flex items-center gap-2">
        {navItems.map(renderNavItem)}
      </div>
    </nav>
  );
}
