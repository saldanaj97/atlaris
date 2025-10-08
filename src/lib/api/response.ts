import type { FailureClassification } from '@/lib/types/client';

import { AppError } from './errors';

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
    headers?: Record<string, string>;
  } = {}
) {
  const { status = 400, code, classification, details, headers = {} } = options;

  // Backwards-compatible shape: if no structured fields provided, return a simple string
  if (!code && !classification && details === undefined) {
    return Response.json({ error: message }, { status, headers });
  }

  return Response.json(
    {
      error: {
        message,
        ...(code ? { code } : {}),
        ...(classification ? { classification } : {}),
        ...(details !== undefined ? { details } : {}),
      },
    },
    { status, headers }
  );
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
