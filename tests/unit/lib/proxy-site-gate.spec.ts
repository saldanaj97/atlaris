import type { SiteGate } from '@/lib/proxy/middleware-policy';

import { NextRequest, type NextFetchEvent } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveSiteGate: vi.fn<() => Promise<SiteGate | null>>(),
  auth: vi.fn<() => Promise<{ userId: string | null }>>(),
  protect: vi.fn(),
}));

vi.mock('@/lib/proxy/site-gate', () => ({
  resolveSiteGate: mocks.resolveSiteGate,
}));

// Runs the proxy handler with a stub `auth`, as clerkMiddleware does after authenticating the request.
vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware:
    (
      handler: (
        auth: unknown,
        request: NextRequest,
        event: NextFetchEvent,
      ) => unknown,
    ) =>
    (request: NextRequest, event: NextFetchEvent) =>
      handler(
        Object.assign(mocks.auth, { protect: mocks.protect }),
        request,
        event,
      ),
}));

async function runProxy(pathname: string): Promise<Response> {
  const { default: proxy } = await import('@/proxy');
  const request = new NextRequest(new URL(pathname, 'https://atlaris.app'));
  return (await proxy(request, {} as NextFetchEvent)) as Response;
}

function redirectTarget(response: Response): string | null {
  const location = response.headers.get('location');
  if (!location) return null;
  const url = new URL(location);
  return `${url.pathname}${url.search}`;
}

describe('proxy site gate per viewer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ userId: null });
    mocks.protect.mockResolvedValue(undefined);
  });

  it('lets a signed-in user through the launch waitlist', async () => {
    mocks.resolveSiteGate.mockResolvedValue('waitlist');
    mocks.auth.mockResolvedValue({ userId: 'user_invited' });

    const response = await runProxy('/dashboard');

    expect(redirectTarget(response)).toBeNull();
    expect(mocks.protect).toHaveBeenCalledTimes(1);
  });

  it('sends a signed-in user from the waitlist page home', async () => {
    mocks.resolveSiteGate.mockResolvedValue('waitlist');
    mocks.auth.mockResolvedValue({ userId: 'user_invited' });

    expect(redirectTarget(await runProxy('/waitlist'))).toBe('/');
  });

  it.each([
    ['/dashboard', '/waitlist'],
    ['/auth/sign-up', '/waitlist?from=sign-up'],
    ['/', '/landing'],
  ])(
    'redirects a signed-out visitor from %s to %s while the waitlist is on',
    async (pathname, target) => {
      mocks.resolveSiteGate.mockResolvedValue('waitlist');

      expect(redirectTarget(await runProxy(pathname))).toBe(target);
      expect(mocks.protect).not.toHaveBeenCalled();
    },
  );

  it('keeps sign-in reachable for signed-out visitors while the waitlist is on', async () => {
    mocks.resolveSiteGate.mockResolvedValue('waitlist');

    expect(redirectTarget(await runProxy('/auth/sign-in'))).toBeNull();
  });

  it.each(['/dashboard', '/auth/sign-in'])(
    'keeps signed-in users on /maintenance from %s',
    async (pathname) => {
      mocks.resolveSiteGate.mockResolvedValue('maintenance');
      mocks.auth.mockResolvedValue({ userId: 'user_invited' });

      expect(redirectTarget(await runProxy(pathname))).toMatch(
        /^\/maintenance/,
      );
    },
  );

  it('does not read the session when no gate is on', async () => {
    mocks.resolveSiteGate.mockResolvedValue(null);

    expect(redirectTarget(await runProxy('/landing'))).toBeNull();
    await runProxy('/dashboard');

    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it('skips the gate and the session read for internal worker routes', async () => {
    mocks.resolveSiteGate.mockResolvedValue('waitlist');

    const response = await runProxy('/api/internal/jobs/regeneration/process');

    expect(redirectTarget(response)).toBeNull();
    expect(mocks.resolveSiteGate).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});

describe('proxy path normalization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ userId: null });
    mocks.protect.mockResolvedValue(undefined);
  });

  // Gate off: the gate redirects every non-exempt path either way, so only the
  // sign-in check shows whether the decoded path reached isProtectedRoute.
  it.each(['/%64ashboard', '/%61pi/v1/plans'])(
    'requires sign-in for the encoded protected path %s with the gate off',
    async (pathname) => {
      mocks.resolveSiteGate.mockResolvedValue(null);

      await runProxy(pathname);

      expect(mocks.protect).toHaveBeenCalledTimes(1);
    },
  );

  it('does not require sign-in for a public page with the gate off', async () => {
    mocks.resolveSiteGate.mockResolvedValue(null);

    expect(redirectTarget(await runProxy('/landing'))).toBeNull();
    expect(mocks.protect).not.toHaveBeenCalled();
  });

  it.each(['/%ZZashboard', '/api/internal%2F..%2F..%2Fdashboard'])(
    'answers 400 for %s before any policy check',
    async (pathname) => {
      mocks.resolveSiteGate.mockResolvedValue('waitlist');

      const response = await runProxy(pathname);

      expect(response.status).toBe(400);
      expect(mocks.resolveSiteGate).not.toHaveBeenCalled();
      expect(mocks.protect).not.toHaveBeenCalled();
    },
  );
});
