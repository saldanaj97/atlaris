import type { ReactElement } from 'react';

import {
  LedgerSectionBlock,
  SettingsLedgerPanel,
} from '@/app/(app)/settings/components/LedgerPrimitives';
import { NotificationsSection } from '@/app/(app)/settings/notifications/components/NotificationsSection';
import { SETTINGS_SECTIONS } from '@/app/(app)/settings/settings-section-ids';

export default function SettingsNotificationsPage(): ReactElement {
  return (
    <SettingsLedgerPanel>
      <LedgerSectionBlock
        id={SETTINGS_SECTIONS.notifications}
        label='Notifications'
        showTitle={false}
      >
        <NotificationsSection />
      </LedgerSectionBlock>
    </SettingsLedgerPanel>
  );
}
