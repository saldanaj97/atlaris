const US_INGEST_ORIGIN = 'https://us.i.posthog.com';
const US_ASSETS_ORIGIN = 'https://us-assets.i.posthog.com';
const EU_INGEST_ORIGIN = 'https://eu.i.posthog.com';
const EU_ASSETS_ORIGIN = 'https://eu-assets.i.posthog.com';

const US_HOSTNAMES = new Set([
  'us.i.posthog.com',
  'us.posthog.com',
  'us-assets.i.posthog.com',
]);
const EU_HOSTNAMES = new Set([
  'eu.i.posthog.com',
  'eu.posthog.com',
  'eu-assets.i.posthog.com',
]);

export type PostHogRewriteDestinations = {
  ingestOrigin: string;
  assetsOrigin: string;
};

function parseHost(host: string): URL | null {
  const trimmed = host.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    const href = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    const url = new URL(href);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function configuredOrigin(url: URL): string {
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/** Absolute host for PostHog SDKs. Accepts schemeless values like `eu.i.posthog.com`. */
export function normalizePostHogSdkHost(host: string): string | null {
  const url = parseHost(host);
  return url === null ? null : configuredOrigin(url);
}

/** Map `NEXT_PUBLIC_POSTHOG_HOST` to PostHog ingest/asset origins. */
export function resolvePostHogRewriteDestinations(
  host?: string | null,
): PostHogRewriteDestinations {
  if (host == null || host.trim().length === 0) {
    return {
      ingestOrigin: US_INGEST_ORIGIN,
      assetsOrigin: US_ASSETS_ORIGIN,
    };
  }

  const url = parseHost(host);
  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_POSTHOG_HOST must be a valid HTTP(S) host without credentials, query parameters, or fragments.',
    );
  }

  const hostname = url.hostname.toLowerCase();
  const hasCustomPath = url.pathname !== '/';
  if (!hasCustomPath && US_HOSTNAMES.has(hostname)) {
    return {
      ingestOrigin: US_INGEST_ORIGIN,
      assetsOrigin: US_ASSETS_ORIGIN,
    };
  }

  if (!hasCustomPath && EU_HOSTNAMES.has(hostname)) {
    return {
      ingestOrigin: EU_INGEST_ORIGIN,
      assetsOrigin: EU_ASSETS_ORIGIN,
    };
  }

  const origin = configuredOrigin(url);
  return {
    ingestOrigin: origin,
    assetsOrigin: origin,
  };
}
