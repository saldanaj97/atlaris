import { ForbiddenError } from '@/lib/api/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function requestHost(req: Request): string | null {
  return req.headers.get('x-forwarded-host') ?? req.headers.get('host');
}

function crossOriginRejected(): ForbiddenError {
  return new ForbiddenError('Cross-origin request rejected.');
}

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
    originHost = new URL(origin).host;
  } catch {
    throw crossOriginRejected();
  }
  if (originHost !== requestHost(req)) {
    throw crossOriginRejected();
  }
}
