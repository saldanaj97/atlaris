import type { ReactElement } from 'react';

import { SettingsLedgerPage } from '@/app/(app)/settings/components/SettingsLedgerPage';

export default async function BillingSettingsPage(): Promise<ReactElement> {
  return <SettingsLedgerPage scrollTo='billing' />;
}
