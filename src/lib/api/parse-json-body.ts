/**
 * Shared JSON request-body parsing for API routes.
 * Handles only `req.json()` and route-specific malformed-JSON behavior.
 */

export type ParseJsonBodyOptions = {
  /**
   * `required`: any non-abort rejection from `req.json()` is passed to `onMalformedJson`.
   * `optional`: only `SyntaxError` when `detectBody(req)` is true throws via `onMalformedJson`;
   * otherwise returns `fallback` (default `{}`).
   */
  mode: 'required' | 'optional';
  onMalformedJson: (err: unknown) => Error;
  /** Defaults to `{}` when `mode === 'optional'`. */
  fallback?: unknown;
  /** Only used in `optional` mode. Defaults to {@link detectJsonBodyPresence}. */
  detectBody?: (req: Request) => boolean;
};

/**
 * Heuristic matching `create-portal`: treat the request as carrying JSON when
 * `Content-Type` includes `application/json` or `Content-Length` is present and not `'0'`.
 */
export function detectJsonBodyPresence(req: Request): boolean {
  const contentType = req.headers.get('content-type') ?? '';
  const contentLength = req.headers.get('content-length');
  return (
    contentType.includes('application/json') ||
    (contentLength !== null && contentLength !== '0')
  );
}

function isAbortLike(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }
  return false;
}

export async function parseJsonBody(
  req: Request,
  options: ParseJsonBodyOptions
): Promise<unknown> {
  const detectBody = options.detectBody ?? detectJsonBodyPresence;

  try {
    return await req.json();
  } catch (err: unknown) {
    if (isAbortLike(err)) {
      throw err;
    }

    if (options.mode === 'required') {
      throw options.onMalformedJson(err);
    }

    if (detectBody(req) && err instanceof SyntaxError) {
      throw options.onMalformedJson(err);
    }

    return options.fallback ?? {};
  }
}
