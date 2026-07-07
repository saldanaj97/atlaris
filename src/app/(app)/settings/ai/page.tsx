import type { ReactElement } from 'react';

import { SettingsLedgerPage } from '@/app/(app)/settings/components/SettingsLedgerPage';

export default function AISettingsPage(): ReactElement {
  return <SettingsLedgerPage scrollTo='ai' />;
}
