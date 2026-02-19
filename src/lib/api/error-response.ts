import type { FailureClassification } from '@/lib/types/client';

export interface ApiErrorResponse {
  error: string;
  code: string;
  classification?: FailureClassification;
  details?: unknown;
  retryAfter?: number;
}

export interface ApiErrorResponseOptions {
  status?: number;
  code?: string;
  classification?: FailureClassification;
  details?: unknown;
  retryAfter?: number;
}

export interface ApiErrorJsonResponseOptions extends ApiErrorResponseOptions {
  headers?: Record<string, string>;
}

const DEFAULT_ERROR_CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  501: 'NOT_IMPLEMENTED',
};

const FAILURE_CLASSIFICATIONS = [
  'validation',
  'provider_error',
  'rate_limit',
  'timeout',
  'capped',
] as const satisfies readonly FailureClassification[];

const FAILURE_CLASSIFICATION_SET = new Set(FAILURE_CLASSIFICATIONS);

export function getDefaultErrorCode(status: number): string {
  return DEFAULT_ERROR_CODE_BY_STATUS[status] ?? 'ERROR';
}

export function buildApiErrorResponse(
  message: string,
  options: ApiErrorResponseOptions = {}
): ApiErrorResponse {
  const { status = 400, code, classification, details, retryAfter } = options;

  const body: ApiErrorResponse = {
    error: message,
    code: code ?? getDefaultErrorCode(status),
  };

  if (classification) {
    body.classification = classification;
  }

  if (details !== undefined) {
    body.details = details;
  }

  if (retryAfter !== undefined) {
    body.retryAfter = retryAfter;
  }

  return body;
}

export function toApiErrorJsonResponse(
  message: string,
  options: ApiErrorJsonResponseOptions = {}
): Response {
  const { status = 400, headers = {} } = options;

  const body = buildApiErrorResponse(message, options);

  return Response.json(body, { status, headers });
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asFailureClassification(
  value: unknown
): FailureClassification | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return FAILURE_CLASSIFICATION_SET.has(value as FailureClassification)
    ? (value as FailureClassification)
    : undefined;
}

function asRetryAfter(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return undefined;
}

export function normalizeApiErrorResponse(
  body: unknown,
  options: { status: number; fallbackMessage: string }
): ApiErrorResponse {
  const { status, fallbackMessage } = options;

  const root = asObject(body);
  const nestedError = asObject(root?.error);

  const message =
    asNonEmptyString(root?.error) ??
    asNonEmptyString(root?.message) ??
    asNonEmptyString(nestedError?.message) ??
    fallbackMessage;

  const code =
    asNonEmptyString(root?.code) ??
    asNonEmptyString(nestedError?.code) ??
    getDefaultErrorCode(status);

  const classification =
    asFailureClassification(root?.classification) ??
    asFailureClassification(nestedError?.classification);

  const details =
    root?.details !== undefined ? root.details : nestedError?.details;

  const retryAfter =
    asRetryAfter(root?.retryAfter) ?? asRetryAfter(nestedError?.retryAfter);

  return {
    error: message,
    code,
    ...(classification ? { classification } : {}),
    ...(details !== undefined ? { details } : {}),
    ...(retryAfter !== undefined ? { retryAfter } : {}),
  };
}

export async function parseApiErrorResponse(
  response: Response,
  fallbackMessage: string
): Promise<ApiErrorResponse> {
  try {
    const body = (await response.json()) as unknown;
    return normalizeApiErrorResponse(body, {
      status: response.status,
      fallbackMessage,
    });
  } catch {
    return {
      error: fallbackMessage,
      code: getDefaultErrorCode(response.status),
    };
  }
}
