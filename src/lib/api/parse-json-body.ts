/**
 * Shared JSON request-body parsing for API routes.
 * Handles `req.json()`, optional actual-byte caps, and route-specific malformed-JSON behavior.
 */

import { AppError } from '@/lib/api/errors';
import { isAbortError } from '@/lib/errors';

const OVERSIZED_BODY_CODE = 'PAYLOAD_TOO_LARGE';

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
  /**
   * Optional actual-byte cap. When omitted, parsing stays on unbounded `req.json()`.
   * When set, oversized `Content-Length` may reject early; the streamed body is
   * still counted in bytes so missing, malformed, or understated headers cannot bypass the cap.
   */
  maxBytes?: number;
};

function parseFiniteContentLength(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return n;
}

function parsePositiveContentLength(value: string | null): number | null {
  const n = parseFiniteContentLength(value);
  if (n === null || n <= 0) {
    return null;
  }
  return n;
}

function oversizedBodyError(): AppError {
  return new AppError('payload too large', {
    status: 413,
    code: OVERSIZED_BODY_CODE,
  });
}

function isOversizedBodyError(err: unknown): err is AppError {
  return err instanceof AppError && err.code() === OVERSIZED_BODY_CODE;
}

/**
 * Treat the request as carrying JSON when `Content-Type` includes
 * `application/json` or `Content-Length` is a positive finite number.
 */
export function detectJsonBodyPresence(req: Request): boolean {
  const contentType = req.headers.get('content-type') ?? '';
  const contentLength = req.headers.get('content-length');
  return (
    contentType.includes('application/json') ||
    parsePositiveContentLength(contentLength) !== null
  );
}

async function readBodyCapped(
  req: Request,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (req.body == null) {
    return new Uint8Array();
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function parseJsonBodyCapped(
  req: Request,
  maxBytes: number,
): Promise<unknown> {
  const declared = parseFiniteContentLength(req.headers.get('content-length'));
  if (declared !== null && declared > maxBytes) {
    throw oversizedBodyError();
  }

  const bytes = await readBodyCapped(req, maxBytes);
  if (bytes === null) {
    throw oversizedBodyError();
  }

  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export async function parseJsonBody(
  req: Request,
  options: ParseJsonBodyOptions,
): Promise<unknown> {
  const detectBody = options.detectBody ?? detectJsonBodyPresence;

  try {
    if (options.maxBytes !== undefined) {
      return await parseJsonBodyCapped(req, options.maxBytes);
    }
    return await req.json();
  } catch (err: unknown) {
    if (isAbortError(err) || isOversizedBodyError(err)) {
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
