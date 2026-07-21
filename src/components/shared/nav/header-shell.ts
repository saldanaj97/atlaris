import { ROUTES } from '@/features/navigation';

export type HeaderShellVariant =
  | 'marketing'
  | 'pricing'
  | 'protected'
  | 'opaque';

export type HeaderShellLayout = 'desktop' | 'mobile';

/** Full-bleed bar grid — content tracks stay equal so the nav centers on the shell. */
const APP_DESKTOP_SHELL =
  'relative hidden h-16 w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-5 md:grid';

const APP_MOBILE_SHELL =
  'relative grid h-16 w-full grid-cols-[auto_1fr_auto] items-center gap-2 px-3 sm:px-4 md:hidden';

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

/** True for marketing surfaces that use the After Hours header (home, landing, pricing). */
function isMarketingHeaderPath(pathname: string): boolean {
  return (
    pathname === ROUTES.HOME ||
    pathname === ROUTES.LANDING ||
    pathname === ROUTES.PRICING
  );
}

/** True when the pathname is the pricing route. */
function isPricingPath(pathname: string): boolean {
  return pathname === ROUTES.PRICING;
}

/** True for authenticated app areas that use the protected header variant. */
function isProtectedHeaderPath(pathname: string): boolean {
  return PROTECTED_HEADER_PREFIXES.some((prefix) =>
    matchesPathOrDescendant(pathname, prefix),
  );
}

/** Maps the current pathname to a header shell variant. */
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

/**
 * Marketing surfaces (home, landing, pricing) use the minimal After Hours
 * nav — not authenticated app chrome — even when the user is signed in.
 */
export function isMarketingHeaderChrome(variant: HeaderShellVariant): boolean {
  return variant === 'marketing' || variant === 'pricing';
}

/** Desktop header grid shell classes for the resolved variant. */
export function desktopHeaderShellClass(_variant: HeaderShellVariant): string {
  return APP_DESKTOP_SHELL;
}

/** Mobile header grid shell classes for the resolved variant. */
export function mobileHeaderShellClass(_variant: HeaderShellVariant): string {
  return APP_MOBILE_SHELL;
}
