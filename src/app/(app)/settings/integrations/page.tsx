import type { ReactElement } from 'react';

import {
  LedgerSectionBlock,
  SettingsLedgerPanel,
} from '@/app/(app)/settings/components/LedgerPrimitives';
import { IntegrationRows } from '@/app/(app)/settings/integrations/components/IntegrationRows';
import { SETTINGS_SECTIONS } from '@/app/(app)/settings/settings-section-ids';

export default function SettingsIntegrationsPage(): ReactElement {
  return (
    <SettingsLedgerPanel>
      <LedgerSectionBlock
        id={SETTINGS_SECTIONS.integrations}
        label='Integrations'
        divided
        showTitle={false}
      >
        <IntegrationRows />
      </LedgerSectionBlock>
    </SettingsLedgerPanel>
  );
}
