import { ROUTES } from '@/features/navigation';
import { cn } from '@/lib/utils';

const PRICING_SHELL_OVERRIDE =
  'border border-white/25 bg-white/20 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-card/20';

const MARKETING_DESKTOP_SHELL =
  'hidden w-full grid-cols-3 items-center rounded-2xl border border-white/40 bg-black/5 px-5 py-2.5 shadow-lg backdrop-blur-xl md:grid dark:border-white/10 dark:bg-card/50';

const APP_DESKTOP_SHELL =
  'hidden w-full grid-cols-3 items-center rounded-2xl border border-border bg-card/95 px-5 py-2.5 shadow-sm md:grid dark:bg-card/95';

const MARKETING_MOBILE_SHELL =
  'relative grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded-2xl border border-white/40 bg-black/5 px-3 py-2 shadow-lg backdrop-blur-xl sm:px-4 sm:py-2.5 md:hidden dark:border-white/10 dark:bg-card/50';

const APP_MOBILE_SHELL =
  'relative grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded-2xl border border-border bg-card/95 px-3 py-2 shadow-sm sm:px-4 sm:py-2.5 md:hidden dark:bg-card/95';

export function isMarketingHeaderPath(pathname: string): boolean {
  return (
    pathname === ROUTES.HOME ||
    pathname === '/landing' ||
    pathname === ROUTES.ABOUT ||
    pathname === ROUTES.PRICING
  );
}

function isPricingPath(pathname: string): boolean {
  return pathname === ROUTES.PRICING;
}

export function desktopHeaderShellClass(pathname: string): string {
  if (isMarketingHeaderPath(pathname)) {
    return cn(
      MARKETING_DESKTOP_SHELL,
      isPricingPath(pathname) && PRICING_SHELL_OVERRIDE,
    );
  }

  return APP_DESKTOP_SHELL;
}

export function mobileHeaderShellClass(pathname: string): string {
  if (isMarketingHeaderPath(pathname)) {
    return cn(
      MARKETING_MOBILE_SHELL,
      isPricingPath(pathname) && PRICING_SHELL_OVERRIDE,
    );
  }

  return APP_MOBILE_SHELL;
}
