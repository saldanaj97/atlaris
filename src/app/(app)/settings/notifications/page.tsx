import type { Metadata } from 'next';
import type { ReactElement } from 'react';

import { SettingsLedgerPage } from '@/app/(app)/settings/components/SettingsLedgerPage';

export const metadata: Metadata = {
  title: 'Notifications',
  description: 'Manage your notification preferences.',
};

export default function NotificationsSettingsPage(): ReactElement {
  return <SettingsLedgerPage scrollTo='notifications' />;
}
