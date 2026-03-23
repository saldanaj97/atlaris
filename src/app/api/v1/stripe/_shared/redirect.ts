import { appEnv } from '@/lib/config/env';

/**
 * Accepts same-origin absolute URLs or same-app relative paths; rejects other origins.
 */
export function isValidRedirectUrl(url: string | undefined): boolean {
  if (!url) return true;

  if (url.startsWith('/')) return true;

  const baseUrl = appEnv.url;
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    return parsed.origin === base.origin;
  } catch {
    return false;
  }
}

/**
 * Resolves an optional user-supplied URL to an absolute URL using the app base URL.
 */
export function resolveRedirectUrl(
  url: string | undefined,
  defaultPath: string
): string {
  const baseUrl = appEnv.url;

  if (!url) {
    return `${baseUrl}${defaultPath}`;
  }

  if (url.startsWith('/')) {
    return `${baseUrl}${url}`;
  }

  return url;
}
