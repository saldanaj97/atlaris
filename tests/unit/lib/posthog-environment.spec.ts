import { isPostHogEnabled } from '@/lib/config/env/posthog';
import { describe, expect, it } from 'vitest';

describe('isPostHogEnabled', () => {
  it('enables PostHog for an explicit Vercel production deployment', () => {
    expect(
      isPostHogEnabled({
        NODE_ENV: 'production',
        VERCEL_ENV: 'production',
      }),
    ).toBe(true);
  });

  it.each([
    { NODE_ENV: 'development', VERCEL_ENV: 'production' },
    { NODE_ENV: 'test', VERCEL_ENV: 'production' },
    { NODE_ENV: 'production', VERCEL_ENV: 'preview' },
    { NODE_ENV: 'production', VERCEL_ENV: 'development' },
    { NODE_ENV: 'production' },
  ])('disables PostHog when production is not explicit', (env) => {
    expect(isPostHogEnabled(env)).toBe(false);
  });

  it('treats a custom staging target as disabled even when the fallback is production', () => {
    expect(
      isPostHogEnabled({
        NODE_ENV: 'production',
        VERCEL_ENV: 'production',
        VERCEL_TARGET_ENV: 'staging',
      }),
    ).toBe(false);
  });

  it('gives a production target precedence over the fallback environment', () => {
    expect(
      isPostHogEnabled({
        NODE_ENV: 'production',
        VERCEL_ENV: 'preview',
        VERCEL_TARGET_ENV: 'production',
      }),
    ).toBe(true);
  });
});
