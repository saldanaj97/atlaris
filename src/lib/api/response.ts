import type { FailureClassification } from '@/lib/types/client';

import { toApiErrorJsonResponse } from '@/lib/api/error-response';
import type { AppError } from '@/lib/api/errors';

interface JsonOptions {
  status?: number;
  headers?: Record<string, string>;
}

export function json<Data>(data: Data, options: JsonOptions = {}) {
  const { status = 200, headers = {} } = options;
  return Response.json(data, { status, headers });
}

export function jsonError(
  message: string,
  options: {
    status?: number;
    code?: string;
    classification?: FailureClassification;
    details?: unknown;
    retryAfter?: number;
    headers?: Record<string, string>;
  } = {}
) {
  return toApiErrorJsonResponse(message, options);
}

export function notImplemented() {
  return jsonError('Not Implemented', {
    status: 501,
    code: 'NOT_IMPLEMENTED',
  });
}

export function methodNotAllowed() {
  return jsonError('Method Not Allowed', {
    status: 405,
    code: 'METHOD_NOT_ALLOWED',
  });
}

export function assert(condition: unknown, err: AppError) {
  if (!condition) throw err;
}
