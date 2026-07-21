'use client';

import type { NavItem } from '@/features/navigation';

import BrandLogo from '../BrandLogo';
import {
  type HeaderShellVariant,
  isMarketingHeaderChrome,
} from '@/components/shared/nav/header-shell';
import { marketingHeaderPrimaryCtaClassName } from '@/components/shared/nav/marketing-header-classes';
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
import { ROUTES } from '@/features/navigation';
import { cn } from '@/lib/utils';
import { Menu, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface MobileNavigationProps {
  headerVariant: HeaderShellVariant;
  pathname: string;
  navItems: NavItem[];
  isAuthenticated?: boolean;
}

/**
 * Mobile navigation component with left-sliding sheet.
 */
export default function MobileNavigation({
  headerVariant,
  pathname,
  navItems,
  isAuthenticated = false,
}: MobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const isMarketing = isMarketingHeaderChrome(headerVariant);
  const primaryCtaHref = isAuthenticated
    ? ROUTES.PLANS.NEW
    : ROUTES.AUTH.SIGN_IN;
  const primaryCtaLabel = isAuthenticated ? 'Create a plan' : 'Get started';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='icon-sm'
            onClick={() => setOpen(true)}
            className='rounded-xl bg-muted text-muted-foreground shadow-sm transition-colors hover:bg-muted/80'
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
        className='w-72 border-r border-border bg-card p-0 shadow-lg'
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
          {/* Primary action — marketing peach CTA or app create-plan */}
          <Button
            asChild
            variant='default'
            className={
              isMarketing
                ? cn(
                    marketingHeaderPrimaryCtaClassName,
                    'mb-2 h-auto w-full justify-center py-3',
                  )
                : 'mb-2 h-auto w-full rounded-xl py-3 shadow-md hover:shadow-lg'
            }
          >
            <Link
              href={isMarketing ? primaryCtaHref : ROUTES.PLANS.NEW}
              onClick={() => {
                setOpen(false);
              }}
            >
              {isMarketing ? null : <Plus className='size-4' />}
              {isMarketing ? primaryCtaLabel : 'Create New Plan'}
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
                      ? 'bg-primary text-primary-foreground shadow-md'
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
