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

async function renderBillingCards(): Promise<void> {
  const { BillingPlanRows, UsageRows } =
    await import('@/app/(app)/settings/billing/components/BillingCards');

  render(
    <>
      {await BillingPlanRows({ locale: 'en-US' })}
      {await UsageRows()}
    </>,
  );
}

describe('BillingCards', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requestBoundaryComponentMock.mockImplementation(async (resolver) =>
      resolver({
        actor: { id: 'user_billing_cards' },
        db: {} as never,
      }),
    );
    mocks.getBillingAccountSnapshotMock.mockResolvedValue({
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
    });
  });

  it('renders each usage meter with explicit labels and limits', async () => {
    await renderBillingCards();

    expect(mocks.getBillingAccountSnapshotMock).toHaveBeenCalledWith({
      userId: 'user_billing_cards',
      dbClient: {},
    });
    expect(screen.getByText('PRO')).toBeVisible();
    expect(screen.getByText('Active plans')).toBeVisible();
    expect(screen.getByText('Regenerations (monthly)')).toBeVisible();
    expect(screen.getByText('Exports (monthly)')).toBeVisible();
    expect(screen.getByText('Lesson generations (monthly)')).toBeVisible();
    expect(screen.getByText('2/5')).toBeVisible();
    expect(screen.getByText('3/10')).toBeVisible();
    expect(screen.getByText('1/8')).toBeVisible();
    expect(screen.getByText('4/20')).toBeVisible();
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
