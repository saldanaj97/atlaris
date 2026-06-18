import { ROUTES } from '@/features/navigation';
import { cn } from '@/lib/utils';

export type HeaderShellVariant =
  | 'marketing'
  | 'pricing'
  | 'protected'
  | 'opaque';

export type HeaderShellLayout = 'desktop' | 'mobile';

const PRICING_SHELL_BORDER = 'border-white/25 dark:border-white/10';

const PRICING_SHELL_SURFACE = 'bg-white/20 dark:bg-white/5';

const GLASS_DESKTOP_STRUCTURE_BASE =
  'relative hidden w-full isolate grid-cols-[auto_minmax(0,1fr)_auto] items-center overflow-hidden rounded-2xl border px-5 py-2.5 shadow-lg md:grid';

const GLASS_DESKTOP_SURFACE =
  'rounded-2xl bg-white/20 backdrop-blur-sm dark:bg-white/10';

const GLASS_MOBILE_STRUCTURE_BASE =
  'relative grid w-full isolate grid-cols-[auto_1fr_auto] items-center gap-2 overflow-hidden rounded-2xl border px-3 py-2 shadow-lg sm:px-4 sm:py-2.5 md:hidden';

const GLASS_MOBILE_SURFACE =
  'rounded-2xl bg-white/20 backdrop-blur-sm dark:bg-white/10';

const APP_DESKTOP_SHELL =
  'hidden w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center rounded-2xl border border-border bg-card px-5 py-2.5 shadow-sm md:grid';

const APP_MOBILE_SHELL =
  'relative grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-sm sm:px-4 sm:py-2.5 md:hidden';

const PROTECTED_HEADER_PREFIXES = [
  ROUTES.DASHBOARD,
  ROUTES.PLANS.ROOT,
  ROUTES.SETTINGS.ROOT,
  ROUTES.ANALYTICS.ROOT,
  '/account',
] as const;

function matchesPathOrDescendant(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** True for marketing surfaces that use the glass header shell (home, landing, about, pricing). */
export function isMarketingHeaderPath(pathname: string): boolean {
  return (
    pathname === ROUTES.HOME ||
    pathname === ROUTES.LANDING ||
    pathname === ROUTES.ABOUT ||
    pathname === ROUTES.PRICING
  );
}

/** True when the pathname is the pricing route (subtle glass intensity). */
export function isPricingPath(pathname: string): boolean {
  return pathname === ROUTES.PRICING;
}

/** True for authenticated app areas that use the protected glass header variant. */
export function isProtectedHeaderPath(pathname: string): boolean {
  return PROTECTED_HEADER_PREFIXES.some((prefix) =>
    matchesPathOrDescendant(pathname, prefix),
  );
}

/** Maps the current pathname to a header shell variant for layout and glass presets. */
export function getHeaderShellVariant(pathname: string): HeaderShellVariant {
  if (isPricingPath(pathname)) {
    return 'pricing';
  }

  if (isMarketingHeaderPath(pathname)) {
    return 'marketing';
  }

  if (isProtectedHeaderPath(pathname)) {
    return 'protected';
  }

  return 'opaque';
}

/** Whether the variant renders a liquid-glass layer instead of an opaque card shell. */
export function usesLiquidGlassHeader(variant: HeaderShellVariant): boolean {
  return variant !== 'opaque';
}

/** Liquid-glass physics intensity preset for the header variant. */
export function headerGlassIntensity(
  variant: HeaderShellVariant,
): 'default' | 'subtle' {
  return variant === 'pricing' ? 'subtle' : 'default';
}

function glassShellBorderClass(variant: HeaderShellVariant): string {
  return cn(
    'border-white/40 dark:border-white/15',
    variant === 'pricing' && PRICING_SHELL_BORDER,
  );
}

/** Tailwind surface classes for the glass scrim behind header content. */
export function headerGlassSurfaceClass(
  variant: HeaderShellVariant,
  layout: HeaderShellLayout,
): string {
  const surface =
    layout === 'desktop' ? GLASS_DESKTOP_SURFACE : GLASS_MOBILE_SURFACE;

  return cn(surface, variant === 'pricing' && PRICING_SHELL_SURFACE);
}

/** Desktop header grid shell classes for the resolved variant. */
export function desktopHeaderShellClass(variant: HeaderShellVariant): string {
  if (usesLiquidGlassHeader(variant)) {
    return cn(GLASS_DESKTOP_STRUCTURE_BASE, glassShellBorderClass(variant));
  }

  return APP_DESKTOP_SHELL;
}

/** Mobile header grid shell classes for the resolved variant. */
export function mobileHeaderShellClass(variant: HeaderShellVariant): string {
  if (usesLiquidGlassHeader(variant)) {
    return cn(GLASS_MOBILE_STRUCTURE_BASE, glassShellBorderClass(variant));
  }

  return APP_MOBILE_SHELL;
}
