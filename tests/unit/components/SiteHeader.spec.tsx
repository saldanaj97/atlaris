import SiteHeader from '@/components/shared/SiteHeader';
import { AuthError, DeletedAuthUserError } from '@/lib/api/errors';
import { render, screen } from '@testing-library/react';
import { createDeferredPromise } from '@tests/helpers/deferred-promise';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionSafe: vi.fn(),
  getShellAuthUserId: vi.fn(),
  shouldUseClerkUi: vi.fn(),
  isLocalProductTestingAuthEnabled: vi.fn(),
  requestBoundaryComponent: vi.fn(),
  currentUser: vi.fn(),
  resolveSiteGate: vi.fn(),
  cookiesHas: vi.fn(),
}));

vi.mock('@/lib/proxy/site-gate', () => ({
  FLAG_OVERRIDES_COOKIE: 'vercel-flag-overrides',
  resolveSiteGate: mocks.resolveSiteGate,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ has: mocks.cookiesHas }),
}));

vi.mock('@/lib/auth/server', () => ({
  getSessionSafe: mocks.getSessionSafe,
}));

vi.mock('@/lib/auth/local-identity', () => ({
  getShellAuthUserId: mocks.getShellAuthUserId,
  shouldUseClerkUi: mocks.shouldUseClerkUi,
  isLocalProductTestingAuthEnabled: mocks.isLocalProductTestingAuthEnabled,
}));

vi.mock('@/lib/api/request-boundary', () => ({
  requestBoundary: {
    component: mocks.requestBoundaryComponent,
  },
}));

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: mocks.currentUser,
}));

vi.mock('@/components/shared/nav/SiteHeaderChrome', () => ({
  default: ({
    userName,
    tier,
    isAuthenticated,
  }: {
    userName?: string;
    tier?: string;
    isAuthenticated: boolean;
  }) => (
    <div
      data-authenticated={String(isAuthenticated)}
      data-testid='site-header-chrome'
    >{`${userName ?? ''}:${tier ?? ''}`}</div>
  ),
}));

describe('SiteHeader', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSessionSafe.mockResolvedValue({
      session: { user: { id: 'user_1' } },
    });
    mocks.getShellAuthUserId.mockReturnValue('user_1');
    mocks.shouldUseClerkUi.mockReturnValue(true);
    mocks.isLocalProductTestingAuthEnabled.mockReturnValue(false);
    mocks.resolveSiteGate.mockResolvedValue(null);
    mocks.cookiesHas.mockReturnValue(false);
  });

  it.each([false, true])(
    'bypasses the site gate cache only when the flag override cookie is present (%s)',
    async (hasOverrides) => {
      mocks.cookiesHas.mockReturnValue(hasOverrides);
      mocks.requestBoundaryComponent.mockResolvedValue({
        tier: 'pro',
        canCreatePlan: true,
      });

      await SiteHeader({ loadAccountProfile: false });

      expect(mocks.cookiesHas).toHaveBeenCalledWith('vercel-flag-overrides');
      expect(mocks.resolveSiteGate).toHaveBeenCalledWith({
        bypassCache: hasOverrides,
      });
    },
  );

  it('starts the Clerk profile lookup without waiting for entitlement', async () => {
    const entitlement = createDeferredPromise<{
      tier: 'pro';
      canCreatePlan: boolean;
    }>();
    const clerkUser = createDeferredPromise<{
      firstName: string;
      lastName: string;
      fullName: string;
      username: string;
      imageUrl: string;
    }>();

    mocks.requestBoundaryComponent.mockImplementation(
      () => entitlement.promise,
    );
    mocks.currentUser.mockImplementation(() => clerkUser.promise);

    const pending = SiteHeader();
    await vi.waitFor(() => {
      expect(mocks.requestBoundaryComponent).toHaveBeenCalledTimes(1);
      expect(mocks.currentUser).toHaveBeenCalledTimes(1);
    });

    entitlement.resolve({ tier: 'pro', canCreatePlan: true });
    clerkUser.resolve({
      firstName: 'Ada',
      lastName: 'Lovelace',
      fullName: 'Ada Lovelace',
      username: 'ada',
      imageUrl: '/ada.png',
    });

    render(await pending);

    expect(screen.getByTestId('site-header-chrome')).toHaveTextContent(
      'Ada Lovelace:pro',
    );
  });

  it('skips the Clerk profile lookup when the header does not render account chrome', async () => {
    mocks.requestBoundaryComponent.mockResolvedValue({
      tier: 'pro',
      canCreatePlan: true,
    });

    render(await SiteHeader({ loadAccountProfile: false }));

    expect(mocks.currentUser).not.toHaveBeenCalled();
    expect(screen.getByTestId('site-header-chrome')).toHaveTextContent(':pro');
  });

  it('renders a just-deleted account as signed out', async () => {
    mocks.requestBoundaryComponent.mockRejectedValue(
      new DeletedAuthUserError(),
    );

    render(await SiteHeader({ loadAccountProfile: false }));

    expect(screen.getByTestId('site-header-chrome')).toHaveAttribute(
      'data-authenticated',
      'false',
    );
  });

  it.each([new AuthError(), new Error('entitlement lookup failed')])(
    'keeps the session authenticated when the entitlement lookup fails with %s',
    async (error) => {
      mocks.requestBoundaryComponent.mockRejectedValue(error);

      render(await SiteHeader({ loadAccountProfile: false }));

      expect(screen.getByTestId('site-header-chrome')).toHaveAttribute(
        'data-authenticated',
        'true',
      );
    },
  );

  it('renders signed-in visitors as signed out behind the maintenance gate', async () => {
    mocks.resolveSiteGate.mockResolvedValue('maintenance');

    render(await SiteHeader({ loadAccountProfile: false }));

    expect(screen.getByTestId('site-header-chrome')).toHaveAttribute(
      'data-authenticated',
      'false',
    );
    expect(mocks.requestBoundaryComponent).not.toHaveBeenCalled();
    expect(mocks.currentUser).not.toHaveBeenCalled();
  });

  it('renders signed-in users as signed in behind the launch waitlist', async () => {
    mocks.resolveSiteGate.mockResolvedValue('waitlist');
    mocks.requestBoundaryComponent.mockResolvedValue({
      tier: 'free',
      canCreatePlan: true,
    });

    render(await SiteHeader({ loadAccountProfile: false }));

    expect(screen.getByTestId('site-header-chrome')).toHaveAttribute(
      'data-authenticated',
      'true',
    );
    expect(screen.getByTestId('site-header-chrome')).toHaveTextContent(':free');
  });

  it('renders signed-out visitors as signed out behind the launch waitlist', async () => {
    mocks.resolveSiteGate.mockResolvedValue('waitlist');
    mocks.getSessionSafe.mockResolvedValue({ session: null });
    mocks.getShellAuthUserId.mockReturnValue(undefined);

    render(await SiteHeader({ loadAccountProfile: false }));

    expect(screen.getByTestId('site-header-chrome')).toHaveAttribute(
      'data-authenticated',
      'false',
    );
    expect(mocks.requestBoundaryComponent).not.toHaveBeenCalled();
  });
});
