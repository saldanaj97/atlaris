'use client';

import AuthControls from '@/components/shared/AuthControls';
import BrandLogo from '@/components/shared/BrandLogo';
import MobileNavigation from '@/components/shared/nav/MobileNavigation';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { type NavItem, ROUTES } from '@/features/navigation';
import { cn } from '@/lib/utils';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { JSX } from 'react';

interface MobileHeaderProps {
  navItems: NavItem[];
  tier?: SubscriptionTier;
  isAuthenticated: boolean;
}

/**
 * Compact header + hamburger when viewport below `md`. From `md` up, {@link DesktopHeader}
 * shows inline nav links instead.
 */
export default function MobileHeader({
  navItems,
  tier,
  isAuthenticated,
}: MobileHeaderProps): JSX.Element {
  const pathname = usePathname();
  const isPricingPage = pathname === ROUTES.PRICING;

  return (
    <div
      className={cn(
        'relative grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded-2xl border border-white/40 bg-black/5 px-3 py-2 shadow-lg backdrop-blur-xl sm:px-4 sm:py-2.5 md:hidden dark:border-white/10 dark:bg-card/50',
        isPricingPage &&
          'border border-white/25 bg-white/20 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-card/20',
      )}
    >
      <div className="flex shrink-0">
        <MobileNavigation navItems={navItems} />
      </div>

      <div className="flex min-w-0 items-center justify-center overflow-hidden" />

      <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center">
        <div className="pointer-events-auto">
          <BrandLogo size="sm" />
        </div>
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <Link
                href={isAuthenticated ? ROUTES.PLANS.NEW : ROUTES.AUTH.SIGN_IN}
                aria-label={isAuthenticated ? 'Create new plan' : 'Sign in'}
              >
                <Plus className="h-4 w-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {isAuthenticated ? 'New plan' : 'Sign in'}
          </TooltipContent>
        </Tooltip>
        <div className="shrink-0">
          <ThemeToggle size="icon-sm" withTooltip />
        </div>
        <div className="min-w-0 shrink-0">
          <AuthControls
            isAuthenticated={isAuthenticated}
            tier={isAuthenticated ? tier : undefined}
          />
        </div>
      </div>
    </div>
  );
}
