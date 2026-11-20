import { stripTrailingSlash } from '@/lib/path/strip-trailing-slash';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/api',
  '/plans',
  '/account',
  '/settings',
  '/analytics',
] as const;

const MAINTENANCE_MODE_BYPASS_PATHS = [
  '/api/health/worker',
  '/api/v1/notifications/email/unsubscribe',
] as const;

export type SiteGate = 'maintenance' | 'waitlist';

const SITE_GATE_PAGES = {
  maintenance: '/maintenance',
  waitlist: '/waitlist',
} as const satisfies Record<SiteGate, string>;

type SiteGatePage = (typeof SITE_GATE_PAGES)[SiteGate];

const MAINTENANCE_MODE_MARKETING_PATHS = [
  '/landing',
  '/pricing',
  '/terms',
  '/privacy',
] as const;

const PROVIDER_WEBHOOK_ROUTE_PREFIXES = [
  '/api/v1/clerk/billing/webhook',
] as const;

const PUBLIC_SIGNED_EMAIL_UNSUBSCRIBE_PATH =
  '/api/v1/notifications/email/unsubscribe' as const;

export function isProviderWebhookRoute(pathname: string): boolean {
  const path = stripTrailingSlash(pathname);
  return PROVIDER_WEBHOOK_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

function isSignedEmailUnsubscribeRoute(path: string): boolean {
  return path === PUBLIC_SIGNED_EMAIL_UNSUBSCRIBE_PATH;
}

function isInternalWorkerRoute(path: string): boolean {
  return path === '/api/internal' || path.startsWith('/api/internal/');
}

export function isProtectedRoute(pathname: string): boolean {
  const path = stripTrailingSlash(pathname);
  if (isProviderWebhookRoute(path)) {
    return false;
  }
  if (isSignedEmailUnsubscribeRoute(path)) {
    return false;
  }
  if (isInternalWorkerRoute(path)) {
    return false;
  }
  if (path === '/api/health/worker') {
    return false;
  }
  return PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function resolveAnonymousAuthPath(
  pathname: string,
): '/auth/sign-in' | '/auth/sign-up' {
  return stripTrailingSlash(pathname) === '/plans/new'
    ? '/auth/sign-up'
    : '/auth/sign-in';
}

function isSiteGatePage(path: string): boolean {
  return (Object.values(SITE_GATE_PAGES) as string[]).includes(path);
}

export function isSiteGateExempt(pathname: string): boolean {
  const path = stripTrailingSlash(pathname);
  return (
    isInternalWorkerRoute(path) ||
    (MAINTENANCE_MODE_BYPASS_PATHS as readonly string[]).includes(path) ||
    (MAINTENANCE_MODE_MARKETING_PATHS as readonly string[]).includes(path)
  );
}

/**
 * The gate one viewer sees. The launch waitlist admits anyone with a Clerk session:
 * while Clerk's sign-up mode is Waitlist, only invited or admin-created users have one.
 * Maintenance holds everyone.
 */
export function resolveViewerSiteGate(
  gate: SiteGate | null,
  signedIn: boolean,
): SiteGate | null {
  return gate === 'waitlist' && signedIn ? null : gate;
}

export function resolveSiteGateRedirectPath(
  gate: SiteGate | null,
  pathname: string,
  options?: { allowGatePagePreview?: boolean },
): SiteGatePage | '/landing' | '/' | null {
  const path = stripTrailingSlash(pathname);
  if (isSiteGateExempt(path)) {
    return null;
  }

  if (gate === null) {
    if (!isSiteGatePage(path)) return null;
    return options?.allowGatePagePreview === true ? null : '/';
  }

  const target = SITE_GATE_PAGES[gate];
  if (path === target) {
    return null;
  }
  if (
    gate === 'waitlist' &&
    resolveSiteGateRedirectSource(path) === 'sign-in'
  ) {
    return null;
  }
  if (path === '/') {
    return '/landing';
  }
  return target;
}

export function resolveSiteGateRedirectSource(
  pathname: string,
): 'sign-in' | 'sign-up' | null {
  const path = stripTrailingSlash(pathname);
  for (const source of ['sign-in', 'sign-up'] as const) {
    const prefix = `/auth/${source}`;
    if (path === prefix || path.startsWith(`${prefix}/`)) return source;
  }
  return null;
}

export function shouldBypassClerkMiddleware(input: {
  isDevelopment: boolean;
  devAuthUserId: string | undefined;
  localProductTestingEnabled: boolean;
  pathname: string;
}): boolean {
  const path = stripTrailingSlash(input.pathname);
  const isApiRoute = path === '/api' || path.startsWith('/api/');

  const devBypass =
    input.isDevelopment && input.devAuthUserId !== undefined && isApiRoute;

  const localProductTestingPageBypass =
    input.isDevelopment &&
    input.devAuthUserId !== undefined &&
    input.localProductTestingEnabled &&
    !isApiRoute;

  return devBypass || localProductTestingPageBypass;
}

export function shouldUseClerkMiddleware(input: {
  isDevelopment: boolean;
  publishableKey: string | undefined;
  secretKey: string | undefined;
}): boolean {
  if (!input.isDevelopment) return true;

  return Boolean(input.publishableKey?.trim() && input.secretKey?.trim());
}
