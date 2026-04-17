/**
 * Shared JSON request-body parsing for API routes.
 * Handles only `req.json()` and route-specific malformed-JSON behavior.
 */

import { isAbortError } from '@/lib/errors';

export type ParseJsonBodyOptions = {
  /**
   * `required`: any non-abort rejection from `req.json()` is passed to `onMalformedJson`.
   * `optional`: only an empty-body `SyntaxError` falls back to `fallback` (default `{}`).
   * If a body is present, malformed JSON throws via `onMalformedJson`; other read failures rethrow.
   */
  mode: 'required' | 'optional';
  onMalformedJson: (err: unknown) => Error;
  /** Defaults to `{}` when `mode === 'optional'`. */
  fallback?: unknown;
  /** Only used in `optional` mode. Defaults to {@link detectJsonBodyPresence}. */
  detectBody?: (req: Request) => boolean;
};

function parsePositiveContentLength(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

/**
 * Heuristic matching `create-portal`: treat the request as carrying JSON when
 * `Content-Type` includes `application/json` or `Content-Length` is a positive
 * finite number (after trim).
 */
export function detectJsonBodyPresence(req: Request): boolean {
  const contentType = req.headers.get('content-type') ?? '';
  const contentLength = req.headers.get('content-length');
  return (
    contentType.includes('application/json') ||
    parsePositiveContentLength(contentLength) !== null
  );
}

export async function parseJsonBody(
  req: Request,
  options: ParseJsonBodyOptions
): Promise<unknown> {
  const detectBody = options.detectBody ?? detectJsonBodyPresence;

  try {
    const body = await req.json();
    return body;
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw err;
    }

    if (options.mode === 'required') {
      throw options.onMalformedJson(err);
    }

    const bodyDetected = detectBody(req);

    if (err instanceof SyntaxError) {
      if (!bodyDetected) {
        return options.fallback ?? {};
      }
      throw options.onMalformedJson(err);
    }

    throw err;
  }
}
