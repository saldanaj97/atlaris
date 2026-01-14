'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { NavItem } from '@/lib/navigation';
import { Menu } from 'lucide-react';
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
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/40 text-gray-600 shadow-sm backdrop-blur-sm transition hover:bg-white/60 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/20"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Sheet content sliding from left */}
      <SheetContent
        side="left"
        className="w-72 border-r border-white/40 bg-white/80 p-0 backdrop-blur-xl dark:border-white/10 dark:bg-gray-900/90"
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
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <div key={item.href} className="flex flex-col gap-1">
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
                      : 'text-gray-600 hover:bg-white/60 hover:text-purple-600 dark:text-gray-200 dark:hover:bg-white/10 dark:hover:text-purple-400'
                  }`}
                >
                  {item.label}
                </Link>
                {item.dropdown && (
                  <div className="ml-4 flex flex-col gap-1 border-l border-purple-100 pl-4 dark:border-purple-900">
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
                              ? 'text-purple-600 dark:text-purple-400'
                              : 'text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400'
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
