/**
 * Validation module for curation resources
 * Handles link health checks, YouTube availability, and URL canonicalization
 */

/**
 * Result of HTTP HEAD check for link health
 */
export type HeadCheckResult = {
  ok: boolean; // True if link is accessible (200 or valid redirect)
  status?: number; // HTTP status code
  finalUrl?: string; // Final URL after redirects
};

/**
 * Check if a URL is accessible via HTTP HEAD request
 * Follows redirects and validates final destination
 * @param url URL to check
 * @param timeoutMs Timeout in milliseconds (default 5000)
 * @returns HeadCheckResult with accessibility status
 */
export async function headOk(
  url: string,
  timeoutMs = 5000
): Promise<HeadCheckResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Atlaris/1.0 (Resource Validator)',
      },
    });

    clearTimeout(timeoutId);

    // Success on 200-299 range
    const ok = response.status >= 200 && response.status < 300;

    return {
      ok,
      status: response.status,
      finalUrl: response.url,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle specific error types
    if (error instanceof Error) {
      // Timeout
      if (error.name === 'AbortError') {
        return { ok: false };
      }
      // Network error
      return { ok: false };
    }

    return { ok: false };
  }
}

/**
 * Check if a YouTube video is embeddable based on status metadata
 * @param status YouTube video status object from API
 * @returns True if video is publicly embeddable
 */
export function isYouTubeEmbeddable(status: {
  privacyStatus?: string;
  embeddable?: boolean;
}): boolean {
  // Video must have a valid privacy status (public or unlisted) and must be embeddable
  const validPrivacy =
    status.privacyStatus === 'public' || status.privacyStatus === 'unlisted';
  return validPrivacy && status.embeddable === true;
}

/**
 * Common tracking parameters to strip from URLs
 */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'fbclid',
  'gclid',
  'msclkid',
  '_ga',
  'mc_cid',
  'mc_eid',
]);

/**
 * Canonicalize a URL by removing common tracking parameters
 * Preserves functional query parameters
 * @param url URL to canonicalize
 * @returns Canonicalized URL string
 */
export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Remove tracking parameters
    for (const param of TRACKING_PARAMS) {
      parsed.searchParams.delete(param);
    }

    // Return canonical URL
    return parsed.toString();
  } catch {
    // If URL parsing fails, return original
    return url;
  }
}
