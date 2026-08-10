import type { ReactElement } from 'react';

import { SettingsLedgerPage } from '@/app/(app)/settings/components/SettingsLedgerPage';

/** Renders Clerk's path-routed profile subpages within the settings ledger. */
export default async function SettingsUserProfilePage(): Promise<ReactElement> {
  return <SettingsLedgerPage />;
}
