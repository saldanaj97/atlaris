import type { ReactElement } from 'react';

import { SettingsLedgerPage } from '@/app/(app)/settings/components/SettingsLedgerPage';

/**
 * Unified settings page — Ledger layout with all account sections.
 */
export default async function SettingsPage(): Promise<ReactElement> {
  return <SettingsLedgerPage />;
}
