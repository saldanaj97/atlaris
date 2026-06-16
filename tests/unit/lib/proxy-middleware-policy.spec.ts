import {
  isProtectedRoute,
  resolveMaintenanceRedirectPath,
  shouldBypassClerkMiddleware,
} from '@/lib/proxy/middleware-policy';
import { describe, expect, it } from 'vitest';

describe('middleware policy', () => {
  it('isProtectedRoute skips stripe webhook', () => {
    expect(isProtectedRoute('/api/v1/stripe/webhook')).toBe(false);
    expect(isProtectedRoute('/dashboard')).toBe(true);
  });

  it.each([
    '/api/internal/',
    '/api/internal/jobs/regeneration/process',
    '/api/internal/maintenance/retention/cleanup',
    '/api/internal/maintenance/plans/cleanup',
    '/api/internal/extra-segment',
  ])('isProtectedRoute skips internal worker prefix %s', (pathname) => {
    expect(isProtectedRoute(pathname)).toBe(false);
  });

  it('isProtectedRoute skips worker health endpoint', () => {
    expect(isProtectedRoute('/api/health/worker')).toBe(false);
  });

  it('isProtectedRoute protects non-internal api routes', () => {
    expect(isProtectedRoute('/api/plans')).toBe(true);
    expect(isProtectedRoute('/api/v1/plans')).toBe(true);
  });

  it('resolveMaintenanceRedirectPath', () => {
    expect(resolveMaintenanceRedirectPath(true, '/x')).toBe('/maintenance');
    expect(resolveMaintenanceRedirectPath(true, '/maintenance')).toBe(null);
    expect(
      resolveMaintenanceRedirectPath(true, '/.well-known/vercel/flags'),
    ).toBe(null);
    expect(
      resolveMaintenanceRedirectPath(true, '/.well-known/workflow/v1/flow'),
    ).toBe(null);
    expect(resolveMaintenanceRedirectPath(true, '/api/health/worker')).toBe(
      null,
    );
    expect(resolveMaintenanceRedirectPath(true, '/api/plans')).toBe(
      '/maintenance',
    );
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
