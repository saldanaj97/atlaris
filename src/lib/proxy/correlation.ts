import type { NextRequest } from 'next/server';

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const CORRELATION_ID_MAX_LENGTH = 64;

export function sanitizeCorrelationId(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > CORRELATION_ID_MAX_LENGTH) return null;
  if (!CORRELATION_ID_PATTERN.test(trimmed)) return null;
  return trimmed;
}

export function getCorrelationId(request: NextRequest): string {
  const headerCorrelationId = request.headers.get('x-correlation-id');
  const sanitized = sanitizeCorrelationId(headerCorrelationId);
  return sanitized ?? crypto.randomUUID();
}
