import { ROUTES } from '@/features/navigation/routes';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  billingPlanRowsMock: vi.fn(),
  usageRowsMock: vi.fn(),
}));

vi.mock('@/app/(app)/settings/ai/components/ModelSelectionCard', () => ({
  ModelSelectionCard: () => <div data-testid='model-selection-card' />,
}));

vi.mock(
  '@/app/(app)/settings/ai/components/ModelSelectionCardSkeleton',
  () => ({
    ModelSelectionCardSkeleton: () => (
      <div data-testid='model-selection-card-skeleton' />
    ),
  }),
);

vi.mock('@/app/(app)/settings/billing/components/BillingCards', () => ({
  BillingPlanRows: (props: { locale?: string; returnPath?: string }) => {
    mocks.billingPlanRowsMock(props);
    return <div data-testid='billing-plan-rows' />;
  },
  UsageRows: (props: { returnPath?: string }) => {
    mocks.usageRowsMock(props);
    return <div data-testid='usage-rows' />;
  },
}));

vi.mock('@/app/(app)/settings/billing/components/BillingCardsSkeleton', () => ({
  BillingPlanSkeleton: () => <div data-testid='billing-plan-skeleton' />,
  UsageSkeleton: () => <div data-testid='usage-skeleton' />,
}));

vi.mock('@/app/(app)/settings/components/LedgerPrimitives', () => ({
  LedgerSectionBlock: ({
    children,
    id,
    label,
  }: {
    children: React.ReactNode;
    id: string;
    label: string;
  }) => (
    <section id={id}>
      <h2>{label}</h2>
      {children}
    </section>
  ),
  SettingsLedgerPanel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/app/(app)/settings/components/SettingsScrollTarget', () => ({
  SettingsScrollTarget: () => null,
}));

vi.mock('@/app/(app)/settings/integrations/components/IntegrationRows', () => ({
  IntegrationRows: () => <div data-testid='integration-rows' />,
}));

vi.mock(
  '@/app/(app)/settings/notifications/components/NotificationsSection',
  () => ({
    NotificationsSection: () => <div data-testid='notifications-section' />,
  }),
);

vi.mock('@/app/(app)/settings/profile/components/ProfileForm', () => ({
  ProfileForm: () => <div data-testid='profile-form' />,
}));

vi.mock('@/lib/auth/local-identity', () => ({
  shouldUseClerkUi: () => false,
}));

vi.mock('@clerk/nextjs', () => ({
  UserProfile: () => <div data-testid='clerk-user-profile' />,
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: () => 'en-US',
  })),
}));

describe('SettingsLedgerPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('keeps billing fallback redirects scoped to the requested settings subpage', async () => {
    const { SettingsLedgerPage } =
      await import('@/app/(app)/settings/components/SettingsLedgerPage');

    render(await SettingsLedgerPage({ scrollTo: 'ai' }));

    expect(mocks.billingPlanRowsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        returnPath: ROUTES.SETTINGS.AI,
      }),
    );
    expect(mocks.usageRowsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        returnPath: ROUTES.SETTINGS.AI,
      }),
    );
  });
});
