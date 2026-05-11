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

export function createCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}
