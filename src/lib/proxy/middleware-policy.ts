const PROTECTED_PREFIXES = [
  '/dashboard',
  '/api',
  '/plans',
  '/account',
  '/settings',
  '/analytics',
] as const;

export function isProtectedRoute(pathname: string): boolean {
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
