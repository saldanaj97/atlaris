import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  billingCardsMock: vi.fn(),
  shouldUseClerkUiMock: vi.fn(() => true),
  userProfileMock: vi.fn(),
}));

vi.mock('@/lib/auth/local-identity', () => ({
  shouldUseClerkUi: mocks.shouldUseClerkUiMock,
}));

vi.mock('@/app/(app)/settings/billing/components/BillingCards', () => ({
  BillingCards: (props: { locale: string }) => {
    mocks.billingCardsMock(props);
    return <div data-testid='billing-cards' />;
  },
}));

vi.mock('@clerk/nextjs', () => ({
  UserProfile: (props: Record<string, unknown>) => {
    mocks.userProfileMock(props);
    return <div data-testid='clerk-user-profile' />;
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: () => 'en-US',
  })),
}));

async function renderBillingSettingsPage(): Promise<void> {
  vi.resetModules();
  const { default: BillingSettingsPage } =
    await import('@/app/(app)/settings/billing/page');
  render(await BillingSettingsPage());
}

describe('BillingSettingsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.shouldUseClerkUiMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders billing cards and Clerk subscription management when Clerk UI is enabled', async () => {
    await renderBillingSettingsPage();

    expect(screen.getByRole('heading', { name: /billing/i })).toBeVisible();
    expect(screen.getByTestId('billing-cards')).toBeVisible();
    expect(screen.getByTestId('clerk-user-profile')).toBeVisible();
    expect(mocks.userProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        routing: 'hash',
      }),
    );
  });

  it('renders billing cards without Clerk subscription management when Clerk UI is disabled', async () => {
    mocks.shouldUseClerkUiMock.mockReturnValue(false);

    await renderBillingSettingsPage();

    expect(screen.getByTestId('billing-cards')).toBeVisible();
    expect(screen.queryByTestId('clerk-user-profile')).not.toBeInTheDocument();
    expect(mocks.userProfileMock).not.toHaveBeenCalled();
  });
});
