import { ForbiddenError } from '@/lib/api/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function requestHost(req: Request): string | null {
  // Vercel sets x-forwarded-host identical to host (docs: request headers).
  return req.headers.get('x-forwarded-host') ?? req.headers.get('host');
}

function crossOriginRejected(): ForbiddenError {
  return new ForbiddenError('Cross-origin request rejected.');
}

/**
 * Browser-origin check for mutating requests (DEV-208, lead 4). Prefers
 * Sec-Fetch-Site (set by every current browser, never by a page), then falls
 * back to Origin. A request with neither header is not from a browser and
 * passes; the session cookie is still required by withAuth.
 *
 * `same-site` is rejected on purpose: no sibling host under the registrable
 * domain calls these routes.
 */
export function assertSameOriginMutation(req: Request): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return;

  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite !== null) {
    if (fetchSite === 'same-origin' || fetchSite === 'none') return;
    throw crossOriginRejected();
  }

  const origin = req.headers.get('origin');
  if (origin === null) return;
  let originHost: string;
  try {
    // `Origin: null` (sandboxed frames, some redirects) fails to parse.
    originHost = new URL(origin).host;
  } catch {
    throw crossOriginRejected();
  }
  if (originHost !== requestHost(req)) {
    throw crossOriginRejected();
  }
}
