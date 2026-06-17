'use client';

import type { NavItem } from '@/features/navigation';

import BrandLogo from '../BrandLogo';
import {
  type HeaderShellVariant,
  usesLiquidGlassHeader,
} from '@/components/shared/nav/header-shell';
import { isNavItemActive } from '@/components/shared/nav/nav-active';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Menu, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface MobileNavigationProps {
  headerVariant: HeaderShellVariant;
  pathname: string;
  navItems: NavItem[];
}

/**
 * Mobile navigation component with left-sliding sheet.
 */
export default function MobileNavigation({
  headerVariant,
  pathname,
  navItems,
}: MobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const usesGlassHeader = usesLiquidGlassHeader(headerVariant);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='icon-sm'
            onClick={() => setOpen(true)}
            className={
              usesGlassHeader
                ? 'rounded-xl bg-white/40 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-white/60 dark:bg-white/10 dark:hover:bg-white/20'
                : 'rounded-xl bg-muted text-muted-foreground shadow-sm transition-colors hover:bg-muted/80'
            }
            aria-label='Open menu'
          >
            <Menu className='size-5' />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='bottom'>Menu</TooltipContent>
      </Tooltip>

      {/* Sheet content sliding from left */}
      <SheetContent
        side='left'
        className={
          usesGlassHeader
            ? 'w-72 border-r border-white/30 bg-white/65 p-0 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-card/55'
            : 'w-72 border-r border-border bg-card p-0 shadow-lg'
        }
      >
        <SheetHeader className='p-6'>
          <BrandLogo size='sm' onClick={() => setOpen(false)} />
          <SheetTitle className='sr-only'>Navigation Menu</SheetTitle>
        </SheetHeader>

        {/* Navigation items */}
        <nav
          className='flex flex-1 flex-col gap-2 px-4'
          aria-label='Mobile navigation'
        >
          {/* Create New Plan - Primary Action */}
          <Button
            asChild
            variant='default'
            className='mb-2 h-auto w-full rounded-xl py-3 shadow-md hover:shadow-lg'
          >
            <Link
              href='/plans/new'
              onClick={() => {
                setOpen(false);
              }}
            >
              <Plus className='size-4' />
              Create New Plan
            </Link>
          </Button>

          {navItems.map((item) => {
            const isActive = isNavItemActive(pathname, item);
            return (
              <div key={item.href} className='flex flex-col gap-1'>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-white shadow-md'
                      : usesGlassHeader
                        ? 'text-muted-foreground hover:bg-white/60 hover:text-primary dark:hover:bg-white/10 dark:hover:text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-primary'
                  }`}
                >
                  {item.label}
                </Link>
                {item.dropdown && (
                  <div className='ml-4 flex flex-col gap-1 border-l border-primary/20 pl-4 dark:border-primary/30'>
                    {item.dropdown.map((subItem) => {
                      const isSubActive = isNavItemActive(pathname, subItem);
                      return (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          onClick={() => setOpen(false)}
                          aria-current={isSubActive ? 'page' : undefined}
                          className={`rounded-md px-3 py-2 text-xs font-medium transition-colors ${
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
