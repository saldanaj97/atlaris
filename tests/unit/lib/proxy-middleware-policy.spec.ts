import {
  isProviderWebhookRoute,
  isProtectedRoute,
  resolveMaintenanceRedirectPath,
  shouldBypassClerkMiddleware,
} from '@/lib/proxy/middleware-policy';
import { describe, expect, it } from 'vitest';

describe('middleware policy', () => {
  it('isProtectedRoute skips Clerk Billing webhook', () => {
    expect(isProtectedRoute('/api/v1/clerk/billing/webhook')).toBe(false);
    expect(isProviderWebhookRoute('/api/v1/clerk/billing/webhook')).toBe(true);
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

  it.each([
    '/api/health/worker',
    '/api/health/worker/',
    '/api/cron/notifications/email',
    '/api/cron/notifications/email/',
    '/api/v1/notifications/email/unsubscribe',
    '/api/v1/notifications/email/unsubscribe/',
  ])('isProtectedRoute skips Clerk-bypass exact path %s', (pathname) => {
    expect(isProtectedRoute(pathname)).toBe(false);
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
    expect(resolveMaintenanceRedirectPath(true, '/api/health/worker/')).toBe(
      null,
    );
    expect(
      resolveMaintenanceRedirectPath(true, '/api/cron/notifications/email'),
    ).toBe(null);
    expect(
      resolveMaintenanceRedirectPath(true, '/api/cron/notifications/email/'),
    ).toBe(null);
    expect(
      resolveMaintenanceRedirectPath(
        true,
        '/api/v1/notifications/email/unsubscribe',
      ),
    ).toBe(null);
    expect(
      resolveMaintenanceRedirectPath(
        true,
        '/api/v1/notifications/email/unsubscribe/',
      ),
    ).toBe(null);
    expect(resolveMaintenanceRedirectPath(true, '/api/plans')).toBe(
      '/maintenance',
    );
    expect(resolveMaintenanceRedirectPath(false, '/maintenance')).toBe('/');
    expect(resolveMaintenanceRedirectPath(false, '/')).toBe(null);
  });

  it('allows the exact regeneration drain through maintenance redirects', () => {
    expect(
      resolveMaintenanceRedirectPath(
        true,
        '/api/internal/jobs/regeneration/process',
      ),
    ).toBe(null);
    expect(
      resolveMaintenanceRedirectPath(
        true,
        '/api/internal/jobs/regeneration/process/',
      ),
    ).toBe(null);
  });

  it.each([
    '/api/internal/maintenance/retention/cleanup',
    '/api/internal/maintenance/plans/cleanup',
    '/api/internal/maintenance/billing/reconcile-clerk',
    '/api/internal/maintenance/notifications/email',
    '/api/internal/jobs/regeneration/process/extra',
    '/api/internal/jobs/regeneration/process-other',
  ])('redirects maintenance-mode non-bypass path %s', (pathname) => {
    expect(resolveMaintenanceRedirectPath(true, pathname)).toBe('/maintenance');
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
