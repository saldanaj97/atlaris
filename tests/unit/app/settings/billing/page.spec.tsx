import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settingsLedgerPageMock: vi.fn(),
}));

vi.mock('@/app/(app)/settings/components/SettingsLedgerPage', () => ({
  SettingsLedgerPage: (props: { scrollTo?: string }) => {
    mocks.settingsLedgerPageMock(props);
    return <div data-testid='settings-ledger-page' />;
  },
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
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders the shared Ledger settings page scrolled to billing', async () => {
    await renderBillingSettingsPage();

    expect(screen.getByTestId('settings-ledger-page')).toBeVisible();
    expect(mocks.settingsLedgerPageMock).toHaveBeenCalledWith({
      scrollTo: 'billing',
    });
  });
});
