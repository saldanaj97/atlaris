import { NextRequest } from 'next/server';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/api',
  '/plans',
  '/account',
  '/settings',
  '/analytics',
] as const;

export function isProtectedRoute(pathname: string): boolean {
  // Auth API routes must NOT be protected (they handle sign-in/sign-up)
  if (pathname.startsWith('/api/auth/')) {
    return false;
  }
  // Stripe webhooks bypass all checks
  if (pathname.startsWith('/api/v1/stripe/webhook')) {
    return false;
  }
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Target path for maintenance redirect, or null when current route is allowed. */
export function resolveMaintenanceRedirectPath(
  maintenanceMode: boolean,
  pathname: string,
): '/maintenance' | '/' | null {
  if (maintenanceMode && pathname !== '/maintenance') {
    return '/maintenance';
  }
  if (!maintenanceMode && pathname === '/maintenance') {
    return '/';
  }
  return null;
}

export function shouldBypassNeonAuthMiddleware(input: {
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

/**
 * Neon Auth middleware only checks session cache for GET; normalize so
 * session validation works for POST and other methods.
 */
export function toGetRequestForSessionValidation(
  request: NextRequest,
): NextRequest {
  if (request.method === 'GET') {
    return request;
  }
  return new NextRequest(request.url, {
    method: 'GET',
    headers: request.headers,
  });
}
