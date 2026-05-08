import { describe, expect, it } from 'vitest';
import {
  isProtectedRoute,
  resolveMaintenanceRedirectPath,
  shouldBypassClerkMiddleware,
} from '@/lib/proxy/middleware-policy';

describe('middleware policy', () => {
  it('isProtectedRoute skips stripe webhook', () => {
    expect(isProtectedRoute('/api/v1/stripe/webhook')).toBe(false);
    expect(isProtectedRoute('/dashboard')).toBe(true);
  });

  it('resolveMaintenanceRedirectPath', () => {
    expect(resolveMaintenanceRedirectPath(true, '/x')).toBe('/maintenance');
    expect(resolveMaintenanceRedirectPath(true, '/maintenance')).toBe(null);
    expect(
      resolveMaintenanceRedirectPath(true, '/.well-known/vercel/flags'),
    ).toBe(null);
    expect(resolveMaintenanceRedirectPath(false, '/maintenance')).toBe('/');
    expect(resolveMaintenanceRedirectPath(false, '/')).toBe(null);
  });

  it('shouldBypassClerkMiddleware', () => {
    expect(
      shouldBypassClerkMiddleware({
        isDevelopment: true,
        devAuthUserId: 'u1',
        localProductTestingEnabled: false,
        pathname: '/api/plans',
      }),
    ).toBe(true);

    expect(
      shouldBypassClerkMiddleware({
        isDevelopment: true,
        devAuthUserId: 'u1',
        localProductTestingEnabled: true,
        pathname: '/dashboard',
      }),
    ).toBe(true);

    expect(
      shouldBypassClerkMiddleware({
        isDevelopment: true,
        devAuthUserId: 'u1',
        localProductTestingEnabled: true,
        pathname: '/api/plans',
      }),
    ).toBe(true);

    expect(
      shouldBypassClerkMiddleware({
        isDevelopment: false,
        devAuthUserId: 'u1',
        localProductTestingEnabled: true,
        pathname: '/dashboard',
      }),
    ).toBe(false);
  });
});
