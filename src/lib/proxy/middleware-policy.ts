const PROTECTED_PREFIXES = [
  '/dashboard',
  '/api',
  '/plans',
  '/account',
  '/settings',
  '/analytics',
] as const;

/** Public routes required by platform integrations (not user app surfaces). */
const MAINTENANCE_MODE_BYPASS_PREFIXES = [
  '/.well-known/vercel/flags',
  /** Workflow SDK runtime callbacks; proxy applies callback auth before Clerk. */
  '/.well-known/workflow/',
] as const;

/** Exact paths that stay reachable during maintenance (route-level auth applies). */
const MAINTENANCE_MODE_BYPASS_PATHS = [
  '/api/health/worker',
  '/api/cron/notifications/email',
  '/api/v1/notifications/email/unsubscribe',
] as const;

const PROVIDER_WEBHOOK_ROUTE_PREFIXES = [
  '/api/v1/clerk/billing/webhook',
] as const;

/** Signed email unsubscribe links authenticate via HMAC; no Clerk session. */
const PUBLIC_SIGNED_EMAIL_UNSUBSCRIBE_PATH =
  '/api/v1/notifications/email/unsubscribe' as const;

export function isProviderWebhookRoute(pathname: string): boolean {
  return PROVIDER_WEBHOOK_ROUTE_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
}

export function isSignedEmailUnsubscribeRoute(pathname: string): boolean {
  return pathname === PUBLIC_SIGNED_EMAIL_UNSUBSCRIBE_PATH;
}

export function isProtectedRoute(pathname: string): boolean {
  // Payment/auth provider webhooks bypass Clerk; route-level signatures apply.
  if (isProviderWebhookRoute(pathname)) {
    return false;
  }
  // One-click unsubscribe authenticates via signed token, not Clerk.
  if (isSignedEmailUnsubscribeRoute(pathname)) {
    return false;
  }
  // Internal worker/maintenance routes bypass Clerk; each route must enforce
  // its own worker token auth (see assertInternalWorkerAccess).
  if (pathname.startsWith('/api/internal/')) {
    return false;
  }
  // Worker health probes authenticate via route-level worker token, not Clerk.
  if (pathname === '/api/health/worker') {
    return false;
  }
  // Vercel Cron authenticates at the route boundary with CRON_SECRET.
  if (pathname === '/api/cron/notifications/email') {
    return false;
  }
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Target path for maintenance redirect, or null when current route is allowed. */
export function resolveMaintenanceRedirectPath(
  maintenanceMode: boolean,
  pathname: string,
): '/maintenance' | '/' | null {
  if (
    MAINTENANCE_MODE_BYPASS_PREFIXES.some((prefix) =>
      pathname.startsWith(prefix),
    ) ||
    (MAINTENANCE_MODE_BYPASS_PATHS as readonly string[]).includes(pathname)
  ) {
    return null;
  }

  if (maintenanceMode && pathname !== '/maintenance') {
    return '/maintenance';
  }
  if (!maintenanceMode && pathname === '/maintenance') {
    return '/';
  }
  return null;
}

export function shouldBypassClerkMiddleware(input: {
  isDevelopment: boolean;
  devAuthUserId: string | undefined;
  localProductTestingEnabled: boolean;
  pathname: string;
}): boolean {
  const devBypass =
    input.isDevelopment &&
    input.devAuthUserId !== undefined &&
    input.pathname.startsWith('/api/');

  const localProductTestingPageBypass =
    input.isDevelopment &&
    input.devAuthUserId !== undefined &&
    input.localProductTestingEnabled &&
    !input.pathname.startsWith('/api/');

  return devBypass || localProductTestingPageBypass;
}
