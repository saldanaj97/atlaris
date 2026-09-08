'use client';

import type { NavItem } from '@/features/navigation';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import BrandLogo from '../BrandLogo';
import AppSidebar from '@/components/shared/nav/AppSidebar';
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
import { resolveCreatePlanCta, ROUTES } from '@/features/navigation';
import { cn } from '@/lib/utils';
import { ArrowRight, Menu, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

interface MobileNavigationProps {
  isMarketing: boolean;
  isAppShell?: boolean;
  pathname: string;
  navItems: NavItem[];
  tier?: SubscriptionTier;
  canCreatePlan?: boolean;
  isAuthenticated?: boolean;
  userName?: string;
}

/**
 * Mobile navigation component with left-sliding sheet.
 */
export default function MobileNavigation({
  isMarketing,
  isAppShell = false,
  pathname,
  navItems,
  tier,
  canCreatePlan,
  isAuthenticated = false,
  userName,
}: MobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const navigationDismissedRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const primaryCtaHref = isAuthenticated
    ? ROUTES.DASHBOARD
    : ROUTES.AUTH.SIGN_IN;
  const primaryCtaLabel = isAuthenticated ? 'Dashboard' : 'Begin tonight';
  const createPlanCta = resolveCreatePlanCta({
    isAuthenticated,
    canCreatePlan,
    createLabel: 'Create New Plan',
  });
  const handleNavigation = () => {
    navigationDismissedRef.current = true;
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='icon-sm'
            ref={triggerRef}
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
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (navigationDismissedRef.current) {
            navigationDismissedRef.current = false;
            return;
          }
          triggerRef.current?.focus();
        }}
        className={cn(
          'w-72 border-r border-border p-0 shadow-lg',
          isAppShell ? 'bg-sidebar' : 'bg-card',
        )}
      >
        {isAppShell ? (
          <>
            <SheetHeader className='sr-only p-0'>
              <SheetTitle>Application navigation</SheetTitle>
            </SheetHeader>
            <AppSidebar
              pathname={pathname}
              navItems={navItems}
              tier={tier}
              userName={userName}
              navigationLabel='Mobile navigation'
              onNavigate={handleNavigation}
            />
          </>
        ) : (
          <>
            <SheetHeader className='p-6'>
              <BrandLogo size='sm' onClick={handleNavigation} />
              <SheetTitle className='sr-only'>Navigation Menu</SheetTitle>
            </SheetHeader>

            {/* Navigation items */}
            <nav
              className='flex flex-1 flex-col gap-2 px-4'
              aria-label='Mobile navigation'
            >
              {/* Primary action — marketing peach CTA or app create-plan */}
              {isMarketing ? (
                <>
                  <Button
                    asChild
                    variant='default'
                    className={cn(
                      marketingHeaderPrimaryCtaClassName,
                      'mb-2 h-auto w-full justify-center py-3',
                    )}
                  >
                    <Link href={primaryCtaHref} onClick={handleNavigation}>
                      {primaryCtaLabel}
                      <ArrowRight
                        aria-hidden='true'
                        className='size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none'
                      />
                    </Link>
                  </Button>
                  {!isAuthenticated ? (
                    <Button
                      asChild
                      variant='ghost'
                      size='sm'
                      className='text-sm text-muted-foreground hover:text-foreground'
                    >
                      <Link
                        href={ROUTES.AUTH.SIGN_IN}
                        onClick={handleNavigation}
                      >
                        Sign in
                      </Link>
                    </Button>
                  ) : null}
                </>
              ) : createPlanCta ? (
                <Button
                  asChild
                  variant='default'
                  className='mb-2 h-auto w-full rounded-xl py-3 shadow-md hover:shadow-lg'
                >
                  <Link href={createPlanCta.href} onClick={handleNavigation}>
                    {createPlanCta.label === 'Upgrade' ? null : (
                      <Plus className='size-4' />
                    )}
                    {createPlanCta.label}
                  </Link>
                </Button>
              ) : null}

              {navItems.map((item) => {
                const isActive = isNavItemActive(pathname, item);
                return (
                  <div key={item.href} className='flex flex-col gap-1'>
                    <Link
                      href={item.href}
                      onClick={handleNavigation}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex min-h-[44px] items-center rounded-xl px-4 py-3 text-sm font-medium transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-md'
                          : 'text-muted-foreground hover:bg-muted hover:text-primary',
                      )}
                    >
                      {item.label}
                    </Link>
                    {item.dropdown && (
                      <div className='ml-4 flex flex-col gap-1 border-l border-primary/20 pl-4 dark:border-primary/30'>
                        {item.dropdown.map((subItem) => {
                          const isSubActive = isNavItemActive(
                            pathname,
                            subItem,
                          );
                          return (
                            <Link
                              key={subItem.href}
                              href={subItem.href}
                              onClick={handleNavigation}
                              aria-current={isSubActive ? 'page' : undefined}
                              className={cn(
                                'flex min-h-[44px] items-center rounded-md px-3 py-2 text-xs font-medium transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
                                isSubActive
                                  ? 'text-primary dark:text-primary'
                                  : 'text-muted-foreground hover:text-primary dark:hover:text-primary',
                              )}
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
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
