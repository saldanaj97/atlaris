import {
  isProviderWebhookRoute,
  isProtectedRoute,
  resolveSiteGateRedirectPath,
  resolveSiteGateRedirectSource,
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

  it('resolveSiteGateRedirectPath', () => {
    expect(resolveSiteGateRedirectPath('maintenance', '/x')).toBe(
      '/maintenance',
    );
    expect(resolveSiteGateRedirectPath('maintenance', '/maintenance')).toBe(
      null,
    );
    expect(
      resolveSiteGateRedirectPath('maintenance', '/.well-known/vercel/flags'),
    ).toBe(null);
    expect(
      resolveSiteGateRedirectPath(
        'maintenance',
        '/.well-known/workflow/v1/flow',
      ),
    ).toBe(null);
    expect(
      resolveSiteGateRedirectPath('maintenance', '/api/health/worker'),
    ).toBe(null);
    expect(
      resolveSiteGateRedirectPath('maintenance', '/api/health/worker/'),
    ).toBe(null);
    expect(
      resolveSiteGateRedirectPath(
        'maintenance',
        '/api/cron/notifications/email',
      ),
    ).toBe(null);
    expect(
      resolveSiteGateRedirectPath(
        'maintenance',
        '/api/cron/notifications/email/',
      ),
    ).toBe(null);
    expect(
      resolveSiteGateRedirectPath(
        'maintenance',
        '/api/v1/notifications/email/unsubscribe',
      ),
    ).toBe(null);
    expect(
      resolveSiteGateRedirectPath(
        'maintenance',
        '/api/v1/notifications/email/unsubscribe/',
      ),
    ).toBe(null);
    // Matcher excludes /ingest; policy is not the ingest gate.
    expect(resolveSiteGateRedirectPath('maintenance', '/ingest')).toBe(
      '/maintenance',
    );
    expect(resolveSiteGateRedirectPath('maintenance', '/ingest/')).toBe(
      '/maintenance',
    );
    expect(resolveSiteGateRedirectPath('maintenance', '/ingest/e')).toBe(
      '/maintenance',
    );
    expect(resolveSiteGateRedirectPath('maintenance', '/ingest/e/')).toBe(
      '/maintenance',
    );
    expect(resolveSiteGateRedirectPath('maintenance', '/ingest/flags')).toBe(
      '/maintenance',
    );
    expect(
      resolveSiteGateRedirectPath('maintenance', '/ingest/static/array.js'),
    ).toBe('/maintenance');
    expect(resolveSiteGateRedirectPath('maintenance', '/api/plans')).toBe(
      '/maintenance',
    );
    expect(resolveSiteGateRedirectPath(null, '/maintenance')).toBe('/');
    expect(resolveSiteGateRedirectPath(null, '/')).toBe(null);
  });

  it.each(['/landing', '/landing/', '/pricing', '/pricing/', '/about'])(
    'keeps marketing page %s live during maintenance',
    (pathname) => {
      expect(resolveSiteGateRedirectPath('maintenance', pathname)).toBe(null);
    },
  );

  it('sends / to the landing page during maintenance', () => {
    expect(resolveSiteGateRedirectPath('maintenance', '/')).toBe('/landing');
  });

  it.each([
    '/auth/sign-in',
    '/auth/sign-up',
    '/auth/sign-up/verify',
    '/dashboard',
    '/plans/new',
    '/settings/billing',
    '/analytics',
    '/pricing/extra',
    '/landing-other',
  ])('redirects app and auth path %s to /maintenance', (pathname) => {
    expect(resolveSiteGateRedirectPath('maintenance', pathname)).toBe(
      '/maintenance',
    );
  });

  it.each(['/landing', '/pricing', '/about', '/waitlist'])(
    'keeps %s live while the launch waitlist is on',
    (pathname) => {
      expect(resolveSiteGateRedirectPath('waitlist', pathname)).toBe(null);
    },
  );

  it.each(['/auth/sign-in', '/auth/sign-up', '/dashboard', '/maintenance'])(
    'redirects %s to /waitlist while the launch waitlist is on',
    (pathname) => {
      expect(resolveSiteGateRedirectPath('waitlist', pathname)).toBe(
        '/waitlist',
      );
    },
  );

  it('sends the waitlist page to /maintenance while maintenance is on', () => {
    expect(resolveSiteGateRedirectPath('maintenance', '/waitlist')).toBe(
      '/maintenance',
    );
  });

  it('sends gate pages home when no gate is on, except in local preview', () => {
    expect(resolveSiteGateRedirectPath(null, '/waitlist')).toBe('/');
    expect(
      resolveSiteGateRedirectPath(null, '/waitlist', {
        allowGatePagePreview: true,
      }),
    ).toBe(null);
  });

  it.each([
    ['/auth/sign-in', 'sign-in'],
    ['/auth/sign-in/factor-one', 'sign-in'],
    ['/auth/sign-up/', 'sign-up'],
    ['/auth/sign-up/verify', 'sign-up'],
    ['/auth/sign-in-other', null],
    ['/plans/new', null],
  ] as const)('resolves redirect source for %s as %s', (pathname, source) => {
    expect(resolveSiteGateRedirectSource(pathname)).toBe(source);
  });

  it('lets local development preview /maintenance while the site stays available', () => {
    expect(
      resolveSiteGateRedirectPath(null, '/maintenance', {
        allowGatePagePreview: true,
      }),
    ).toBe(null);
    expect(
      resolveSiteGateRedirectPath(null, '/maintenance', {
        allowGatePagePreview: false,
      }),
    ).toBe('/');
    expect(
      resolveSiteGateRedirectPath('maintenance', '/dashboard', {
        allowGatePagePreview: true,
      }),
    ).toBe('/maintenance');
  });

  it('allows the exact regeneration drain through maintenance redirects', () => {
    expect(
      resolveSiteGateRedirectPath(
        'maintenance',
        '/api/internal/jobs/regeneration/process',
      ),
    ).toBe(null);
    expect(
      resolveSiteGateRedirectPath(
        'maintenance',
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
    expect(resolveSiteGateRedirectPath('maintenance', pathname)).toBe(
      '/maintenance',
    );
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
