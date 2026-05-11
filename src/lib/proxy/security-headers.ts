const CLERK_FRONTEND_API_SRC = 'https://*.clerk.accounts.dev';
const CLOUDFLARE_CHALLENGES_SRC = 'https://challenges.cloudflare.com';

export function createContentSecurityPolicy(input: {
  isDevelopment: boolean;
  nonce?: string;
}): string {
  const nonceSource = input.nonce ? `'nonce-${input.nonce}'` : null;
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
        ...(nonceSource ? [nonceSource] : []),
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
