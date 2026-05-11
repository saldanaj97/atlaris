import { describe, expect, it } from 'vitest';

import { createContentSecurityPolicy } from '@/lib/proxy/security-headers';

describe('proxy security headers', () => {
  it('allows Clerk assets required by hosted auth components', () => {
    const csp = createContentSecurityPolicy({
      isDevelopment: false,
      nonce: 'request-nonce',
    });

    const scriptSrc =
      csp
        .split('; ')
        .find((directive) => directive.startsWith('script-src ')) ?? '';

    expect(scriptSrc).toBe(
      "script-src 'self' 'nonce-request-nonce' https://*.clerk.accounts.dev https://challenges.cloudflare.com",
    );
    expect(csp).toContain("frame-src 'self' https://challenges.cloudflare.com");
    expect(csp).toContain("connect-src 'self' https: wss:");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('keeps unsafe-eval limited to local development', () => {
    const csp = createContentSecurityPolicy({ isDevelopment: true });

    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain('https://*.clerk.accounts.dev');
  });
});
