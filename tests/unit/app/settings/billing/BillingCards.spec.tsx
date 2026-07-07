import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBillingAccountSnapshotMock: vi.fn(),
  redirectMock: vi.fn(),
  requestBoundaryComponentMock: vi.fn(),
}));

vi.mock('@/features/billing/account-snapshot', () => ({
  getBillingAccountSnapshot: mocks.getBillingAccountSnapshotMock,
}));

vi.mock('@/lib/api/request-boundary', () => ({
  requestBoundary: {
    component: mocks.requestBoundaryComponentMock,
  },
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirectMock,
}));

const billingSnapshot = {
  tier: 'pro',
  subscriptionStatus: 'active',
  subscriptionPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
  cancelAtPeriodEnd: false,
  usage: {
    tier: 'pro',
    activePlans: { current: 2, limit: 5 },
    regenerations: { used: 3, limit: 10 },
    exports: { used: 1, limit: 8 },
    lessonGenerations: { used: 4, limit: 20 },
  },
};

async function renderBillingPlanRows(): Promise<void> {
  const { BillingPlanRows } =
    await import('@/app/(app)/settings/billing/components/BillingCards');

  render(await BillingPlanRows({ locale: 'en-US' }));
}

async function renderUsageRows(): Promise<void> {
  const { UsageRows } =
    await import('@/app/(app)/settings/billing/components/BillingCards');

  render(await UsageRows());
}

describe('BillingPlanRows', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requestBoundaryComponentMock.mockImplementation(async (resolver) =>
      resolver({
        actor: { id: 'user_billing_cards' },
        db: {} as never,
      }),
    );
    mocks.getBillingAccountSnapshotMock.mockResolvedValue(billingSnapshot);
  });

  it('renders plan summary rows from the billing snapshot', async () => {
    await renderBillingPlanRows();

    expect(mocks.getBillingAccountSnapshotMock).toHaveBeenCalledWith({
      userId: 'user_billing_cards',
      dbClient: {},
    });
    expect(screen.getByText('PRO')).toBeVisible();
    expect(screen.getByText('active')).toBeVisible();
    expect(screen.getByText('Jul 1, 2026')).toBeVisible();
  });
});

describe('UsageRows', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requestBoundaryComponentMock.mockImplementation(async (resolver) =>
      resolver({
        actor: { id: 'user_billing_cards' },
        db: {} as never,
      }),
    );
    mocks.getBillingAccountSnapshotMock.mockResolvedValue(billingSnapshot);
  });

  it('renders each usage meter with explicit labels and limits', async () => {
    await renderUsageRows();

    expect(mocks.getBillingAccountSnapshotMock).toHaveBeenCalledWith({
      userId: 'user_billing_cards',
      dbClient: {},
    });
    expect(screen.getByLabelText('Active plans: 2 of 5')).toBeVisible();
    expect(
      screen.getByLabelText('Monthly regenerations: 3 of 10'),
    ).toBeVisible();
    expect(screen.getByLabelText('Monthly exports: 1 of 8')).toBeVisible();
    expect(
      screen.getByLabelText('Monthly lesson generations: 4 of 20'),
    ).toBeVisible();
  });
});
