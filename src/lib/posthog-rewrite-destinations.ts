const US_INGEST_ORIGIN = 'https://us.i.posthog.com';
const US_ASSETS_ORIGIN = 'https://us-assets.i.posthog.com';
const EU_INGEST_ORIGIN = 'https://eu.i.posthog.com';
const EU_ASSETS_ORIGIN = 'https://eu-assets.i.posthog.com';

const EU_HOSTNAMES = new Set([
  'eu.i.posthog.com',
  'eu.posthog.com',
  'eu-assets.i.posthog.com',
]);

export type PostHogRewriteDestinations = {
  ingestOrigin: string;
  assetsOrigin: string;
};

function hostnameFromHost(host: string): string | null {
  const trimmed = host.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    const href = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    return new URL(href).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Map `NEXT_PUBLIC_POSTHOG_HOST` to PostHog Cloud ingest/asset origins. */
export function resolvePostHogRewriteDestinations(
  host?: string | null,
): PostHogRewriteDestinations {
  const hostname = host == null ? null : hostnameFromHost(host);
  if (hostname && EU_HOSTNAMES.has(hostname)) {
    return {
      ingestOrigin: EU_INGEST_ORIGIN,
      assetsOrigin: EU_ASSETS_ORIGIN,
    };
  }

  return {
    ingestOrigin: US_INGEST_ORIGIN,
    assetsOrigin: US_ASSETS_ORIGIN,
  };
}
