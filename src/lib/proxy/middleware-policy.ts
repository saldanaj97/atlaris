import { stripTrailingSlash } from '@/lib/path/strip-trailing-slash';

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
  '/.well-known/workflow',
] as const;

/** Exact paths that stay reachable during maintenance (route-level auth applies). */
const MAINTENANCE_MODE_BYPASS_PATHS = [
  '/api/health/worker',
  '/api/cron/notifications/email',
  '/api/internal/jobs/regeneration/process',
  '/api/v1/notifications/email/unsubscribe',
] as const;

const PROVIDER_WEBHOOK_ROUTE_PREFIXES = [
  '/api/v1/clerk/billing/webhook',
] as const;

/** Signed email unsubscribe links authenticate via HMAC; no Clerk session. */
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

export function isProtectedRoute(pathname: string): boolean {
  const path = stripTrailingSlash(pathname);
  // Payment/auth provider webhooks bypass Clerk; route-level signatures apply.
  if (isProviderWebhookRoute(path)) {
    return false;
  }
  // One-click unsubscribe authenticates via signed token, not Clerk.
  if (isSignedEmailUnsubscribeRoute(path)) {
    return false;
  }
  // Internal worker/maintenance routes bypass Clerk; each route must enforce
  // its own worker token auth (see assertInternalWorkerAccess).
  if (path === '/api/internal' || path.startsWith('/api/internal/')) {
    return false;
  }
  // Worker health probes authenticate via route-level worker token, not Clerk.
  if (path === '/api/health/worker') {
    return false;
  }
  // Vercel Cron authenticates at the route boundary with CRON_SECRET.
  if (path === '/api/cron/notifications/email') {
    return false;
  }
  return PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** Target path for maintenance redirect, or null when current route is allowed. */
export function resolveMaintenanceRedirectPath(
  maintenanceMode: boolean,
  pathname: string,
): '/maintenance' | '/' | null {
  const path = stripTrailingSlash(pathname);
  if (
    MAINTENANCE_MODE_BYPASS_PREFIXES.some((prefix) =>
      path.startsWith(prefix),
    ) ||
    (MAINTENANCE_MODE_BYPASS_PATHS as readonly string[]).includes(path)
  ) {
    return null;
  }

  if (maintenanceMode && path !== '/maintenance') {
    return '/maintenance';
  }
  if (!maintenanceMode && path === '/maintenance') {
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
