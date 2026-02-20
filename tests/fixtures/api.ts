/**
 * Creates a request targeting the auth catch-all route.
 */
export function createAuthRequest(
  path: string,
  options?: RequestInit
): Request {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new Request(`http://localhost/api/auth${normalizedPath}`, options);
}

/**
 * Creates dynamic route context for /api/auth/[...path].
 */
export function createRouteContext(path: string[]): {
  params: Promise<{ path: string[] }>;
} {
  return {
    params: Promise.resolve({ path }),
  };
}

/**
 * Shared deterministic retry-after used by auth route rate-limit unit tests.
 */
export const AUTH_RATE_LIMIT_RETRY_AFTER_SECONDS = 30;
