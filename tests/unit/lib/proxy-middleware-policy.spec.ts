import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  isProtectedRoute,
  resolveMaintenanceRedirectPath,
  shouldBypassNeonAuthMiddleware,
  toGetRequestForSessionValidation,
} from '@/lib/proxy/middleware-policy';

describe('middleware policy', () => {
  it('isProtectedRoute skips auth api and stripe webhook', () => {
    expect(isProtectedRoute('/api/auth/sign-in')).toBe(false);
    expect(isProtectedRoute('/api/v1/stripe/webhook')).toBe(false);
    expect(isProtectedRoute('/dashboard')).toBe(true);
  });

  it('resolveMaintenanceRedirectPath', () => {
    expect(resolveMaintenanceRedirectPath(true, '/x')).toBe('/maintenance');
    expect(resolveMaintenanceRedirectPath(true, '/maintenance')).toBe(null);
    expect(resolveMaintenanceRedirectPath(false, '/maintenance')).toBe('/');
    expect(resolveMaintenanceRedirectPath(false, '/')).toBe(null);
  });

  it('shouldBypassNeonAuthMiddleware', () => {
    expect(
      shouldBypassNeonAuthMiddleware({
        isDevelopment: true,
        devAuthUserId: 'u1',
        localProductTestingEnabled: false,
        pathname: '/api/plans',
      }),
    ).toBe(true);

    expect(
      shouldBypassNeonAuthMiddleware({
        isDevelopment: true,
        devAuthUserId: 'u1',
        localProductTestingEnabled: true,
        pathname: '/dashboard',
      }),
    ).toBe(true);

    expect(
      shouldBypassNeonAuthMiddleware({
        isDevelopment: true,
        devAuthUserId: 'u1',
        localProductTestingEnabled: true,
        pathname: '/api/plans',
      }),
    ).toBe(true);

    expect(
      shouldBypassNeonAuthMiddleware({
        isDevelopment: false,
        devAuthUserId: 'u1',
        localProductTestingEnabled: true,
        pathname: '/dashboard',
      }),
    ).toBe(false);
  });

  it('toGetRequestForSessionValidation normalizes method', () => {
    const post = new NextRequest('http://localhost/api/x', { method: 'POST' });
    const get = toGetRequestForSessionValidation(post);
    expect(get.method).toBe('GET');
    const already = new NextRequest('http://localhost/api/x', {
      method: 'GET',
    });
    expect(toGetRequestForSessionValidation(already)).toBe(already);
  });
});
