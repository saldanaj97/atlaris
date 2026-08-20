/**
 * Application-owned PostHog ingest proxy.
 *
 * Installed posthog-js 1.415.1 surface only: POST /e/, POST /s/, POST /flags/,
 * GET/HEAD /array/{token}/config(.js), GET/HEAD /static/{version}/{kind}.js
 * and /static/{kind}.js. Origins come from resolvePostHogRewriteDestinations.
 */

import { AppError, toErrorResponse } from '@/lib/api/errors';
import { getProcessEnvSource, parseNodeEnv } from '@/lib/config/env/shared';
import { isAbortError } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';
import { resolvePostHogRewriteDestinations } from '@/lib/posthog-rewrite-destinations';

export const POSTHOG_INGEST_MAX_BODY_BYTES = 1024 * 1024;
export const POSTHOG_INGEST_UPSTREAM_TIMEOUT_MS = 10_000;

const INGEST_PREFIX = '/ingest';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const STATIC_KINDS = new Set([
  'conversations',
  'crisp-chat-integration',
  'dead-clicks-autocapture',
  'exception-autocapture',
  'intercom-integration',
  'lazy-recorder',
  'logs',
  'product-tours',
  'recorder',
  'surveys',
  'toolbar',
  'tracing-headers',
  'web-vitals',
  'web-vitals-soft-navs',
  'web-vitals-with-attribution',
  'web-vitals-with-attribution-soft-navs',
]);

const ONE_SEGMENT = /^[0-9A-Za-z][0-9A-Za-z._-]{0,199}$/;
const ALLOWED_CONTENT_TYPES = new Set([
  'application/json',
  'application/x-www-form-urlencoded',
  'text/plain',
]);
const ALLOWED_CONTENT_ENCODINGS = new Set(['gzip']);
const ALLOWED_COMPRESSION_QUERY = new Set(['gzip-js', 'base64']);
const RESPONSE_HEADER_ALLOWLIST = new Set([
  'cache-control',
  'content-encoding',
  'content-type',
  'etag',
  'last-modified',
]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type OriginKind = 'ingest' | 'assets';

type ResolvedTarget = {
  originKind: OriginKind;
  upstreamPath: string;
  allowedMethods: readonly string[];
  allowsBody: boolean;
  query: URLSearchParams;
};

type RejectReason =
  | 'unknown_path'
  | 'method_not_allowed'
  | 'options_not_relayed'
  | 'unexpected_body'
  | 'payload_too_large'
  | 'invalid_content_type'
  | 'invalid_origin'
  | 'upstream_redirect'
  | 'upstream_timeout'
  | 'upstream_failure';

function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

function isAllowedUpstreamOrigin(url: URL): boolean {
  if (url.username || url.password || url.hash) {
    return false;
  }
  if (url.protocol === 'https:') {
    return true;
  }
  if (url.protocol !== 'http:') {
    return false;
  }
  return (
    isLoopbackHostname(url.hostname) &&
    parseNodeEnv(getProcessEnvSource()) !== 'production'
  );
}

function mediaType(value: string): string {
  return value.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function parseDeclaredContentLength(value: string | null): number | null {
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

function logReject(
  reason: RejectReason,
  request: Request,
  extra?: Record<string, unknown>,
): void {
  let pathname = '';
  try {
    pathname = new URL(request.url).pathname.slice(0, 200);
  } catch {
    pathname = '';
  }
  logger.warn(
    { reason, method: request.method, pathname, ...extra },
    'PostHog ingest proxy rejected request',
  );
}

function reject(
  request: Request,
  reason: RejectReason,
  message: string,
  options: {
    status: number;
    code: string;
    headers?: Record<string, string>;
  },
): AppError {
  logReject(reason, request);
  return new AppError(message, {
    status: options.status,
    code: options.code,
    headers: options.headers,
  });
}

function allowHeader(methods: readonly string[]): Record<string, string> {
  return { Allow: methods.join(', ') };
}

function matchStaticKindFile(segment: string): string | null {
  if (!segment.endsWith('.js')) {
    return null;
  }
  const kind = segment.slice(0, -3);
  return STATIC_KINDS.has(kind) ? kind : null;
}

function parseAllowedQuery(
  searchParams: URLSearchParams,
  endpoint: 'capture' | 'flags' | 'array' | 'static-versioned' | 'static-kind',
): URLSearchParams | null {
  const allowed = new URLSearchParams();
  const keys = [...new Set(searchParams.keys())];

  for (const key of keys) {
    const values = searchParams.getAll(key);
    if (values.length !== 1) {
      return null;
    }
    const value = values[0] ?? '';

    if (endpoint === 'capture') {
      if (key === 'compression' && ALLOWED_COMPRESSION_QUERY.has(value)) {
        allowed.set(key, value);
        continue;
      }
      if ((key === 'sent_at' || key === '_') && /^\d{1,16}$/.test(value)) {
        allowed.set(key, value);
        continue;
      }
      return null;
    }

    if (endpoint === 'flags') {
      if (key === 'v' && value === '2') {
        allowed.set(key, value);
        continue;
      }
      if (key === 'only_evaluate_survey_feature_flags' && value === 'true') {
        allowed.set(key, value);
        continue;
      }
      if (key === 'compression' && ALLOWED_COMPRESSION_QUERY.has(value)) {
        allowed.set(key, value);
        continue;
      }
      if ((key === 'sent_at' || key === '_') && /^\d{1,16}$/.test(value)) {
        allowed.set(key, value);
        continue;
      }
      return null;
    }

    if (endpoint === 'static-kind' || endpoint === 'static-versioned') {
      if (key === 'v' && ONE_SEGMENT.test(value)) {
        allowed.set(key, value);
        continue;
      }
      if (
        endpoint === 'static-kind' &&
        key === 't' &&
        /^\d{1,16}$/.test(value)
      ) {
        allowed.set(key, value);
        continue;
      }
      return null;
    }

    return null;
  }

  if (endpoint === 'array' && keys.length > 0) {
    return null;
  }

  return allowed;
}

function resolveTarget(request: Request): ResolvedTarget {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    throw reject(request, 'unknown_path', 'Not Found', {
      status: 404,
      code: 'NOT_FOUND',
    });
  }

  const pathname = url.pathname;
  if (
    pathname.includes('\\') ||
    pathname.includes('%') ||
    pathname.includes('//')
  ) {
    throw reject(request, 'unknown_path', 'Not Found', {
      status: 404,
      code: 'NOT_FOUND',
    });
  }

  if (pathname === INGEST_PREFIX || pathname === `${INGEST_PREFIX}/`) {
    throw reject(request, 'unknown_path', 'Not Found', {
      status: 404,
      code: 'NOT_FOUND',
    });
  }

  if (!pathname.startsWith(`${INGEST_PREFIX}/`)) {
    throw reject(request, 'unknown_path', 'Not Found', {
      status: 404,
      code: 'NOT_FOUND',
    });
  }

  const remainder = pathname.slice(`${INGEST_PREFIX}/`.length);
  const segments = remainder.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw reject(request, 'unknown_path', 'Not Found', {
      status: 404,
      code: 'NOT_FOUND',
    });
  }

  const trailingSlash = remainder.endsWith('/');
  const meaningful = trailingSlash ? segments.slice(0, -1) : segments;

  if (meaningful.length === 1 && meaningful[0] === 'e') {
    const query = parseAllowedQuery(url.searchParams, 'capture');
    if (!query) {
      throw reject(request, 'unknown_path', 'Not Found', {
        status: 404,
        code: 'NOT_FOUND',
      });
    }
    return {
      originKind: 'ingest',
      upstreamPath: '/e/',
      allowedMethods: ['POST'],
      allowsBody: true,
      query,
    };
  }

  if (meaningful.length === 1 && meaningful[0] === 's' && trailingSlash) {
    const query = parseAllowedQuery(url.searchParams, 'capture');
    if (!query) {
      throw reject(request, 'unknown_path', 'Not Found', {
        status: 404,
        code: 'NOT_FOUND',
      });
    }
    return {
      originKind: 'ingest',
      upstreamPath: '/s/',
      allowedMethods: ['POST'],
      allowsBody: true,
      query,
    };
  }

  if (meaningful.length === 1 && meaningful[0] === 'flags') {
    const query = parseAllowedQuery(url.searchParams, 'flags');
    if (!query) {
      throw reject(request, 'unknown_path', 'Not Found', {
        status: 404,
        code: 'NOT_FOUND',
      });
    }
    return {
      originKind: 'ingest',
      upstreamPath: '/flags/',
      allowedMethods: ['POST'],
      allowsBody: true,
      query,
    };
  }

  if (
    meaningful.length === 3 &&
    meaningful[0] === 'array' &&
    ONE_SEGMENT.test(meaningful[1] ?? '') &&
    (meaningful[2] === 'config' || meaningful[2] === 'config.js') &&
    !trailingSlash
  ) {
    const query = parseAllowedQuery(url.searchParams, 'array');
    if (!query) {
      throw reject(request, 'unknown_path', 'Not Found', {
        status: 404,
        code: 'NOT_FOUND',
      });
    }
    return {
      originKind: 'assets',
      upstreamPath: `/array/${meaningful[1]}/${meaningful[2]}`,
      allowedMethods: ['GET', 'HEAD'],
      allowsBody: false,
      query,
    };
  }

  if (
    meaningful.length === 3 &&
    meaningful[0] === 'static' &&
    ONE_SEGMENT.test(meaningful[1] ?? '') &&
    matchStaticKindFile(meaningful[2] ?? '') &&
    !trailingSlash
  ) {
    const query = parseAllowedQuery(url.searchParams, 'static-versioned');
    if (!query) {
      throw reject(request, 'unknown_path', 'Not Found', {
        status: 404,
        code: 'NOT_FOUND',
      });
    }
    return {
      originKind: 'assets',
      upstreamPath: `/static/${meaningful[1]}/${meaningful[2]}`,
      allowedMethods: ['GET', 'HEAD'],
      allowsBody: false,
      query,
    };
  }

  if (
    meaningful.length === 2 &&
    meaningful[0] === 'static' &&
    matchStaticKindFile(meaningful[1] ?? '') &&
    !trailingSlash
  ) {
    const query = parseAllowedQuery(url.searchParams, 'static-kind');
    if (!query) {
      throw reject(request, 'unknown_path', 'Not Found', {
        status: 404,
        code: 'NOT_FOUND',
      });
    }
    return {
      originKind: 'assets',
      upstreamPath: `/static/${meaningful[1]}`,
      allowedMethods: ['GET', 'HEAD'],
      allowsBody: false,
      query,
    };
  }

  throw reject(request, 'unknown_path', 'Not Found', {
    status: 404,
    code: 'NOT_FOUND',
  });
}

function buildOutboundHeaders(request: Request, allowsBody: boolean): Headers {
  const outbound = new Headers();
  if (!allowsBody) {
    return outbound;
  }

  const contentType = request.headers.get('content-type');
  if (contentType !== null) {
    if (!ALLOWED_CONTENT_TYPES.has(mediaType(contentType))) {
      throw reject(request, 'invalid_content_type', 'Bad Request', {
        status: 400,
        code: 'BAD_REQUEST',
      });
    }
    outbound.set('content-type', contentType);
  }

  const contentEncoding = request.headers.get('content-encoding');
  if (contentEncoding !== null) {
    if (!ALLOWED_CONTENT_ENCODINGS.has(contentEncoding.trim().toLowerCase())) {
      throw reject(request, 'invalid_content_type', 'Bad Request', {
        status: 400,
        code: 'BAD_REQUEST',
      });
    }
    outbound.set('content-encoding', contentEncoding);
  }

  return outbound;
}

function buildDownstreamHeaders(upstream: Headers): Headers {
  const headers = new Headers();
  for (const name of RESPONSE_HEADER_ALLOWLIST) {
    const value = upstream.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  return headers;
}

function joinUpstreamUrl(
  originBase: string,
  upstreamPath: string,
  query: URLSearchParams,
): URL {
  const base = new URL(originBase);
  if (!isAllowedUpstreamOrigin(base)) {
    throw new Error('invalid origin');
  }
  const prefix = base.pathname === '/' ? '' : base.pathname.replace(/\/+$/, '');
  const combinedPath = `${prefix}${upstreamPath}`;
  const upstream = new URL(base.origin);
  upstream.pathname = combinedPath;
  for (const [key, value] of query.entries()) {
    upstream.searchParams.append(key, value);
  }
  if (
    upstream.origin !== base.origin ||
    upstream.username ||
    upstream.password ||
    (upstream.pathname !== combinedPath &&
      `${upstream.pathname}/` !== combinedPath)
  ) {
    throw new Error('invalid origin');
  }
  return upstream;
}

async function readBodyCapped(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array | null> {
  if (request.body == null) {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
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

function isTimeoutAbort(
  error: unknown,
  timeoutSignal: AbortSignal,
  requestSignal: AbortSignal,
): boolean {
  if (requestSignal.aborted && !timeoutSignal.aborted) {
    return false;
  }
  if (timeoutSignal.aborted) {
    return true;
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'TimeoutError'
  );
}

async function handle(request: Request): Promise<Response> {
  const target = resolveTarget(request);
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    throw reject(request, 'options_not_relayed', 'Method Not Allowed', {
      status: 405,
      code: 'METHOD_NOT_ALLOWED',
      headers: allowHeader(target.allowedMethods),
    });
  }

  if (!target.allowedMethods.includes(method)) {
    throw reject(request, 'method_not_allowed', 'Method Not Allowed', {
      status: 405,
      code: 'METHOD_NOT_ALLOWED',
      headers: allowHeader(target.allowedMethods),
    });
  }

  const declared = parseDeclaredContentLength(
    request.headers.get('content-length'),
  );
  if (request.headers.has('content-length') && declared === null) {
    throw reject(request, 'unexpected_body', 'Bad Request', {
      status: 400,
      code: 'BAD_REQUEST',
    });
  }

  let body: Uint8Array | undefined;
  if (!target.allowsBody) {
    if (declared !== null && declared > 0) {
      if (request.body != null) {
        await request.body.cancel().catch(() => undefined);
      }
      throw reject(request, 'unexpected_body', 'Bad Request', {
        status: 400,
        code: 'BAD_REQUEST',
      });
    }
    if (request.body != null) {
      await request.body.cancel().catch(() => undefined);
    }
  } else {
    if (declared !== null && declared > POSTHOG_INGEST_MAX_BODY_BYTES) {
      if (request.body != null) {
        await request.body.cancel().catch(() => undefined);
      }
      throw reject(request, 'payload_too_large', 'payload too large', {
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
      });
    }
    const bytes = await readBodyCapped(request, POSTHOG_INGEST_MAX_BODY_BYTES);
    if (bytes === null) {
      throw reject(request, 'payload_too_large', 'payload too large', {
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
      });
    }
    body = bytes;
  }

  let destinations;
  try {
    destinations = resolvePostHogRewriteDestinations(
      process.env.NEXT_PUBLIC_POSTHOG_HOST,
    );
  } catch {
    throw reject(request, 'invalid_origin', 'Bad Gateway', {
      status: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const originBase =
    target.originKind === 'assets'
      ? destinations.assetsOrigin
      : destinations.ingestOrigin;

  let upstreamUrl: URL;
  try {
    upstreamUrl = joinUpstreamUrl(
      originBase,
      target.upstreamPath,
      target.query,
    );
  } catch {
    throw reject(request, 'invalid_origin', 'Bad Gateway', {
      status: 502,
      code: 'BAD_GATEWAY',
    });
  }

  const outboundHeaders = buildOutboundHeaders(request, target.allowsBody);
  const timeoutSignal = AbortSignal.timeout(POSTHOG_INGEST_UPSTREAM_TIMEOUT_MS);
  const signal = AbortSignal.any([request.signal, timeoutSignal]);

  let upstream: Response;
  try {
    const init: RequestInit = {
      method,
      headers: outboundHeaders,
      redirect: 'manual',
      credentials: 'omit',
      signal,
    };
    if (target.allowsBody && body !== undefined) {
      // ponytail: TS 5.7 ArrayBuffer generics reject Uint8Array as BodyInit
      init.body = body as unknown as BodyInit;
    }
    upstream = await fetch(upstreamUrl, init);
  } catch (error) {
    if (isTimeoutAbort(error, timeoutSignal, request.signal)) {
      throw reject(request, 'upstream_timeout', 'Gateway Timeout', {
        status: 504,
        code: 'GATEWAY_TIMEOUT',
      });
    }
    if (isAbortError(error) && request.signal.aborted) {
      throw error;
    }
    throw reject(request, 'upstream_failure', 'Bad Gateway', {
      status: 502,
      code: 'BAD_GATEWAY',
    });
  }

  if (REDIRECT_STATUSES.has(upstream.status)) {
    await upstream.body?.cancel().catch(() => undefined);
    throw reject(request, 'upstream_redirect', 'Bad Gateway', {
      status: 502,
      code: 'BAD_GATEWAY',
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: buildDownstreamHeaders(upstream.headers),
  });
}

export async function proxyIngestRequest(request: Request): Promise<Response> {
  try {
    return await handle(request);
  } catch (error) {
    if (isAbortError(error) && request.signal.aborted) {
      return new Response(null, {
        status: 499,
        headers: { Connection: 'close' },
      });
    }
    return toErrorResponse(error);
  }
}
