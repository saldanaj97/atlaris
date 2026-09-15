'use client';

import type { NavItem } from '@/features/navigation';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import BrandLogo from '../BrandLogo';
import AppSidebar from '@/components/shared/nav/AppSidebar';
import {
  desktopMediaQuery,
  focusVisibleDesktopNavigation,
} from '@/components/shared/nav/desktop-nav-sync';
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
import { useEffect, useRef, useState } from 'react';

interface MobileNavigationProps {
  isMarketing: boolean;
  isAppShell?: boolean;
  pathname: string;
  navItems: NavItem[];
  tier?: SubscriptionTier;
  canCreatePlan?: boolean;
  isAuthenticated?: boolean;
  userName?: string;
  userImageUrl?: string | null;
}

function MobileAppSheetBody({
  navItems,
  onNavigate,
  pathname,
  tier,
  userImageUrl,
  userName,
}: {
  navItems: NavItem[];
  onNavigate: () => void;
  pathname: string;
  tier?: SubscriptionTier;
  userImageUrl?: string | null;
  userName?: string;
}) {
  return (
    <>
      <SheetHeader className='sr-only p-0'>
        <SheetTitle>Application navigation</SheetTitle>
      </SheetHeader>
      <AppSidebar
        pathname={pathname}
        navItems={navItems}
        tier={tier}
        userName={userName}
        userImageUrl={userImageUrl}
        navigationLabel='Mobile navigation'
        onNavigate={onNavigate}
      />
    </>
  );
}

function MobileSheetPrimaryAction({
  createPlanCta,
  isAuthenticated,
  isMarketing,
  onNavigate,
  primaryCtaHref,
  primaryCtaLabel,
}: {
  createPlanCta: ReturnType<typeof resolveCreatePlanCta>;
  isAuthenticated: boolean;
  isMarketing: boolean;
  onNavigate: () => void;
  primaryCtaHref: string;
  primaryCtaLabel: string;
}) {
  if (isMarketing) {
    return (
      <>
        <Button
          asChild
          variant='default'
          className={cn(
            marketingHeaderPrimaryCtaClassName,
            'mb-2 h-auto w-full justify-center py-3',
          )}
        >
          <Link href={primaryCtaHref} onClick={onNavigate}>
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
            <Link href={ROUTES.AUTH.SIGN_IN} onClick={onNavigate}>
              Sign in
            </Link>
          </Button>
        ) : null}
      </>
    );
  }

  if (!createPlanCta) return null;

  return (
    <Button
      asChild
      variant='default'
      className='mb-2 h-auto w-full rounded-xl py-3 shadow-md hover:shadow-lg'
    >
      <Link href={createPlanCta.href} onClick={onNavigate}>
        {createPlanCta.label === 'Upgrade' ? null : <Plus className='size-4' />}
        {createPlanCta.label}
      </Link>
    </Button>
  );
}

function MobileSheetNavItems({
  navItems,
  onNavigate,
  pathname,
}: {
  navItems: NavItem[];
  onNavigate: () => void;
  pathname: string;
}) {
  return (
    <>
      {navItems.map((item) => {
        const isActive = isNavItemActive(pathname, item);
        return (
          <div key={item.href} className='flex flex-col gap-1'>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center rounded-xl px-4 py-3 text-sm font-medium transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:bg-muted hover:text-primary',
              )}
            >
              {item.label}
            </Link>
            {item.dropdown ? (
              <div className='ml-4 flex flex-col gap-1 border-l border-primary/20 pl-4 dark:border-primary/30'>
                {item.dropdown.map((subItem) => {
                  const isSubActive = isNavItemActive(pathname, subItem);
                  return (
                    <Link
                      key={subItem.href}
                      href={subItem.href}
                      onClick={onNavigate}
                      aria-current={isSubActive ? 'page' : undefined}
                      className={cn(
                        'flex min-h-11 items-center rounded-md px-3 py-2 text-xs font-medium transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
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
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function MobileLinkSheetBody({
  createPlanCta,
  isAuthenticated,
  isMarketing,
  navItems,
  onNavigate,
  pathname,
  primaryCtaHref,
  primaryCtaLabel,
}: {
  createPlanCta: ReturnType<typeof resolveCreatePlanCta>;
  isAuthenticated: boolean;
  isMarketing: boolean;
  navItems: NavItem[];
  onNavigate: () => void;
  pathname: string;
  primaryCtaHref: string;
  primaryCtaLabel: string;
}) {
  return (
    <>
      <SheetHeader className='p-6'>
        <BrandLogo size='sm' onClick={onNavigate} />
        <SheetTitle className='sr-only'>Navigation Menu</SheetTitle>
      </SheetHeader>

      <nav
        className='flex flex-1 flex-col gap-2 px-4'
        aria-label='Mobile navigation'
      >
        <MobileSheetPrimaryAction
          createPlanCta={createPlanCta}
          isAuthenticated={isAuthenticated}
          isMarketing={isMarketing}
          onNavigate={onNavigate}
          primaryCtaHref={primaryCtaHref}
          primaryCtaLabel={primaryCtaLabel}
        />
        <MobileSheetNavItems
          navItems={navItems}
          onNavigate={onNavigate}
          pathname={pathname}
        />
      </nav>
    </>
  );
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
  userImageUrl,
}: MobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const navigationDismissedRef = useRef(false);
  const closedForBreakpointRef = useRef(false);
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

  useEffect(() => {
    if (!open) return;
    if (typeof window.matchMedia !== 'function') return;

    const media = window.matchMedia(desktopMediaQuery(isAppShell));
    const closeIfDesktop = () => {
      if (!media.matches) return;
      closedForBreakpointRef.current = true;
      setOpen(false);
    };

    closeIfDesktop();
    media.addEventListener('change', closeIfDesktop);
    return () => media.removeEventListener('change', closeIfDesktop);
  }, [isAppShell, open]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isMarketing ? 'outline' : 'ghost'}
            size={isMarketing ? 'sm' : 'icon-sm'}
            ref={triggerRef}
            onClick={() => setOpen(true)}
            className={
              isMarketing
                ? 'gap-2 rounded-[10px] border-border px-3.5 py-3 font-sans text-sm font-medium text-foreground pointer-coarse:min-h-11'
                : 'rounded-xl bg-muted text-muted-foreground shadow-sm transition-colors hover:bg-muted/80'
            }
            aria-label='Open menu'
          >
            {isMarketing ? <span>Menu</span> : null}
            <Menu className='size-5' aria-hidden='true' />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='bottom'>Menu</TooltipContent>
      </Tooltip>

      <SheetContent
        side='left'
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (navigationDismissedRef.current) {
            navigationDismissedRef.current = false;
            return;
          }
          if (closedForBreakpointRef.current) {
            closedForBreakpointRef.current = false;
            focusVisibleDesktopNavigation(isAppShell);
            return;
          }
          triggerRef.current?.focus();
        }}
        className={cn(
          'w-[min(18rem,calc(100vw-2rem))] border-r p-0 shadow-lg',
          isAppShell
            ? 'border-sidebar-border bg-sidebar'
            : 'border-border bg-card',
        )}
      >
        {isAppShell ? (
          <MobileAppSheetBody
            navItems={navItems}
            onNavigate={handleNavigation}
            pathname={pathname}
            tier={tier}
            userImageUrl={userImageUrl}
            userName={userName}
          />
        ) : (
          <MobileLinkSheetBody
            createPlanCta={createPlanCta}
            isAuthenticated={isAuthenticated}
            isMarketing={isMarketing}
            navItems={navItems}
            onNavigate={handleNavigation}
            pathname={pathname}
            primaryCtaHref={primaryCtaHref}
            primaryCtaLabel={primaryCtaLabel}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
