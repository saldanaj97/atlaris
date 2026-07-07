import type { ReactElement } from 'react';

import { SettingsLedgerPage } from '@/app/(app)/settings/components/SettingsLedgerPage';

export default function SettingsIntegrationsPage(): ReactElement {
  return <SettingsLedgerPage scrollTo='integrations' />;
}
