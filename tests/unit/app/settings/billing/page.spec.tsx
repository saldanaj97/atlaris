import SettingsBillingPage from '@/app/(app)/settings/billing/page';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'accept-language': 'en-US' }),
}));

vi.mock('@/app/(app)/settings/billing/components/BillingCards', () => ({
  BillingPlanRows: () => <p>Plan rows</p>,
}));

vi.mock(
  '@/app/(app)/settings/billing/components/CheckoutSubscriptionSyncHost',
  () => ({ CheckoutSubscriptionSyncHost: () => null }),
);

describe('SettingsBillingPage', () => {
  it('leaves the page heading to the settings layout', async () => {
    render(await SettingsBillingPage());

    // The layout's "Billing" heading names this page; a second heading here
    // would repeat it one level down.
    expect(screen.queryAllByRole('heading')).toHaveLength(0);
    expect(
      screen.getByRole('region', { name: 'Plan & billing' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Plan rows')).toBeInTheDocument();
  });
});
