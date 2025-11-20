/**
 * Shared utility functions for API route handlers
 */

/**
 * Extracts plan ID from request URL path.
 * Works for URLs like /api/v1/plans/{planId}/* where planId can be
 * at different positions depending on the route.
 *
 * @param req - The request object
 * @param position - Position from the end of the path (default: -1 for last segment, -2 for second-to-last)
 * @returns The plan ID from the URL
 */
export function getPlanIdFromUrl(
  req: Request,
  position: 'last' | 'second-to-last' = 'last'
): string | undefined {
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);

  if (position === 'last') {
    return segments[segments.length - 1];
  } else {
    return segments[segments.length - 2];
  }
}

/**
 * Validates whether a string is a UUID (version-agnostic).
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    value
  );
}
