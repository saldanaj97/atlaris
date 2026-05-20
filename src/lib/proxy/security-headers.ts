import type { NextResponse } from 'next/server';

const CLERK_FRONTEND_API_SRC = 'https://*.clerk.accounts.dev';
const CLOUDFLARE_CHALLENGES_SRC = 'https://challenges.cloudflare.com';

export type CreateContentSecurityPolicyInput =
  | { isDevelopment: true; nonce?: string }
  | { isDevelopment: false; nonce: string };

export function createContentSecurityPolicy(
  input: CreateContentSecurityPolicyInput,
): string {
  if (!input.isDevelopment) {
    if (typeof input.nonce !== 'string' || input.nonce.length === 0) {
      throw new Error(
        'createContentSecurityPolicy: production requires non-empty nonce',
      );
    }
  }

  const scriptSrc = input.isDevelopment
    ? [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        CLERK_FRONTEND_API_SRC,
        CLOUDFLARE_CHALLENGES_SRC,
      ]
    : [
        "'self'",
        `'nonce-${input.nonce}'`,
        CLERK_FRONTEND_API_SRC,
        CLOUDFLARE_CHALLENGES_SRC,
      ];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    `frame-src 'self' ${CLOUDFLARE_CHALLENGES_SRC}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function applyProxySecurityHeaders(
  response: NextResponse,
  contentSecurityPolicy: string,
  options?: { isProduction?: boolean },
): NextResponse {
  response.headers.set('Content-Security-Policy', contentSecurityPolicy);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );

  if (options?.isProduction) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  return response;
}

export function createCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}
