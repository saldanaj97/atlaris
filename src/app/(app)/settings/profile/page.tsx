import type { ReactElement } from 'react';

import { SettingsLedgerPage } from '@/app/(app)/settings/components/SettingsLedgerPage';

export default async function ProfileSettingsPage(): Promise<ReactElement> {
  return <SettingsLedgerPage scrollTo='profile' />;
}
