import SiteHeader from '@/components/shared/SiteHeader';
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
  default: ({ userName, tier }: { userName?: string; tier?: string }) => (
    <div data-testid='site-header-chrome'>{`${userName ?? ''}:${tier ?? ''}`}</div>
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
  });

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
    await Promise.resolve();

    expect(mocks.requestBoundaryComponent).toHaveBeenCalledTimes(1);
    expect(mocks.currentUser).toHaveBeenCalledTimes(1);

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
});
