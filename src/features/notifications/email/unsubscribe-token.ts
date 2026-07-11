import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_PURPOSE = 'email_unsubscribe_all' as const;
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 days

export type UnsubscribeTokenPayload = {
  userId: string;
  purpose: typeof TOKEN_PURPOSE;
  iat: number;
  exp: number;
};

export function createUnsubscribeToken(args: {
  userId: string;
  secret: string;
  nowMs?: number;
  ttlMs?: number;
}): string {
  const nowMs = args.nowMs ?? Date.now();
  const ttlMs = args.ttlMs ?? DEFAULT_TTL_MS;
  const payload: UnsubscribeTokenPayload = {
    userId: args.userId,
    purpose: TOKEN_PURPOSE,
    iat: Math.floor(nowMs / 1000),
    exp: Math.floor((nowMs + ttlMs) / 1000),
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  const signature = sign(body, args.secret);
  return `${body}.${signature}`;
}

export function verifyUnsubscribeToken(args: {
  token: string;
  secret: string;
  nowMs?: number;
}): UnsubscribeTokenPayload | null {
  const parts = args.token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [body, signature] = parts;
  if (!body || !signature) {
    return null;
  }

  const expected = sign(body, args.secret);
  if (!signaturesEqual(signature, expected)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!isUnsubscribePayload(payload)) {
    return null;
  }

  const nowSec = Math.floor((args.nowMs ?? Date.now()) / 1000);
  if (payload.exp < nowSec) {
    return null;
  }
  if (payload.purpose !== TOKEN_PURPOSE) {
    return null;
  }

  return payload;
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

function signaturesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function isUnsubscribePayload(
  value: unknown,
): value is UnsubscribeTokenPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.userId === 'string' &&
    record.userId.length > 0 &&
    record.purpose === TOKEN_PURPOSE &&
    typeof record.iat === 'number' &&
    typeof record.exp === 'number'
  );
}
