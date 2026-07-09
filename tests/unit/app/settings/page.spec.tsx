import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settingsLedgerPageMock: vi.fn(),
}));

vi.mock('@/app/(app)/settings/components/SettingsLedgerPage', () => ({
  SettingsLedgerPage: (props: Record<string, unknown>) => {
    mocks.settingsLedgerPageMock(props);
    return <div data-testid='settings-ledger-page' />;
  },
}));

async function renderSettingsPage(): Promise<void> {
  vi.resetModules();
  const { default: SettingsPage } = await import('@/app/(app)/settings/page');
  render(await SettingsPage());
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('renders the unified settings ledger', async () => {
    await renderSettingsPage();

    expect(screen.getByTestId('settings-ledger-page')).toBeVisible();
    expect(mocks.settingsLedgerPageMock).toHaveBeenCalledWith({});
  });
});
