import {
  isProviderWebhookRoute,
  isProtectedRoute,
  resolveMaintenanceRedirectPath,
  shouldBypassClerkMiddleware,
  shouldUseClerkMiddleware,
} from '@/lib/proxy/middleware-policy';
import { describe, expect, it } from 'vitest';

describe('middleware policy', () => {
  it.each([
    '/api/v1/clerk/billing/webhook',
    '/api/v1/clerk/billing/webhook/',
    '/api/v1/clerk/billing/webhook/events',
    '/api/v1/clerk/billing/webhook/events/',
  ])('treats %s as a provider webhook and Clerk bypass', (pathname) => {
    expect(isProviderWebhookRoute(pathname)).toBe(true);
    expect(isProtectedRoute(pathname)).toBe(false);
  });

  it('does not treat sibling webhook-unrelated path as a provider webhook', () => {
    expect(
      isProviderWebhookRoute('/api/v1/clerk/billing/webhook-unrelated'),
    ).toBe(false);
    expect(isProtectedRoute('/api/v1/clerk/billing/webhook-unrelated')).toBe(
      true,
    );
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

  it('isProtectedRoute protects non-internal api and dashboard routes', () => {
    expect(isProtectedRoute('/api/plans')).toBe(true);
    expect(isProtectedRoute('/api/v1/plans')).toBe(true);
    expect(isProtectedRoute('/dashboard')).toBe(true);
    expect(isProtectedRoute('/dashboard/')).toBe(true);
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
    // Matcher excludes /ingest; policy is not the ingest gate.
    expect(resolveMaintenanceRedirectPath(true, '/ingest')).toBe(
      '/maintenance',
    );
    expect(resolveMaintenanceRedirectPath(true, '/ingest/')).toBe(
      '/maintenance',
    );
    expect(resolveMaintenanceRedirectPath(true, '/ingest/e')).toBe(
      '/maintenance',
    );
    expect(resolveMaintenanceRedirectPath(true, '/ingest/e/')).toBe(
      '/maintenance',
    );
    expect(resolveMaintenanceRedirectPath(true, '/ingest/flags')).toBe(
      '/maintenance',
    );
    expect(
      resolveMaintenanceRedirectPath(true, '/ingest/static/array.js'),
    ).toBe('/maintenance');
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

  it.each([
    {
      expected: false,
      isDevelopment: true,
      publishableKey: undefined,
      secretKey: undefined,
    },
    {
      expected: false,
      isDevelopment: true,
      publishableKey: 'pk_test_example',
      secretKey: undefined,
    },
    {
      expected: true,
      isDevelopment: true,
      publishableKey: 'pk_test_example',
      secretKey: 'sk_test_example',
    },
    {
      expected: true,
      isDevelopment: false,
      publishableKey: undefined,
      secretKey: undefined,
    },
  ])(
    'shouldUseClerkMiddleware returns $expected for development=$isDevelopment with the supplied keys',
    ({ expected, isDevelopment, publishableKey, secretKey }) => {
      expect(
        shouldUseClerkMiddleware({
          isDevelopment,
          publishableKey,
          secretKey,
        }),
      ).toBe(expected);
    },
  );
});
