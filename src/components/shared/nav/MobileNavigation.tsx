'use client';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { trackEvent } from '@/lib/analytics';
import type { NavItem } from '@/lib/navigation';
import { Menu, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import BrandLogo from '../BrandLogo';

interface MobileNavigationProps {
  navItems: NavItem[];
}

/**
 * Mobile navigation component with left-sliding sheet.
 */
export default function MobileNavigation({ navItems }: MobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* Hamburger trigger */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="text-muted-foreground h-9 w-9 rounded-xl bg-white/40 shadow-sm backdrop-blur-sm transition hover:bg-white/60 dark:bg-white/10 dark:hover:bg-white/20"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Sheet content sliding from left */}
      <SheetContent
        side="left"
        className="dark:bg-card/90 w-72 border-r border-white/40 bg-white/80 p-0 backdrop-blur-xl dark:border-white/10"
      >
        <SheetHeader className="p-6">
          <BrandLogo size="sm" onClick={() => setOpen(false)} />
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        </SheetHeader>

        {/* Navigation items */}
        <nav
          className="flex flex-1 flex-col gap-2 px-4"
          aria-label="Mobile navigation"
        >
          {/* Create New Plan - Primary Action */}
          <Link
            href="/plans/new"
            onClick={() => {
              trackEvent({
                event: 'cta_click',
                label: 'Create New Plan',
                location: 'nav',
              });
              setOpen(false);
            }}
            className="from-primary to-accent hover:from-primary/90 hover:to-accent/90 mb-2 flex items-center justify-center gap-2 rounded-xl bg-linear-to-r px-4 py-3 text-sm font-medium text-white shadow-md transition-all hover:shadow-lg"
          >
            <Plus className="h-4 w-4" />
            Create New Plan
          </Link>

          {navItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href ||
                  pathname.startsWith(item.href + '/');
            return (
              <div key={item.href} className="flex flex-col gap-1">
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                    isActive
                      ? 'from-primary to-accent bg-linear-to-r text-white shadow-md'
                      : 'text-muted-foreground hover:text-primary dark:hover:text-primary hover:bg-white/60 dark:hover:bg-white/10'
                  }`}
                >
                  {item.label}
                </Link>
                {item.dropdown && (
                  <div className="border-primary/20 dark:border-primary/30 ml-4 flex flex-col gap-1 border-l pl-4">
                    {item.dropdown.map((subItem) => {
                      const isSubActive = pathname === subItem.href;
                      return (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          onClick={() => setOpen(false)}
                          aria-current={isSubActive ? 'page' : undefined}
                          className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                            isSubActive
                              ? 'text-primary dark:text-primary'
                              : 'text-muted-foreground hover:text-primary dark:hover:text-primary'
                          }`}
                        >
                          {subItem.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
