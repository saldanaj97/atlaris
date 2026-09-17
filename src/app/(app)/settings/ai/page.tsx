import type { ReactElement } from 'react';

import { ModelSelectionCard } from '@/app/(app)/settings/ai/components/ModelSelectionCard';
import { ModelSelectionCardSkeleton } from '@/app/(app)/settings/ai/components/ModelSelectionCardSkeleton';
import {
  LedgerSectionBlock,
  SettingsLedgerPanel,
} from '@/app/(app)/settings/components/LedgerPrimitives';
import { SETTINGS_SECTIONS } from '@/app/(app)/settings/settings-section-ids';
import { Suspense } from 'react';

export default function SettingsAiPage(): ReactElement {
  return (
    <SettingsLedgerPanel>
      <LedgerSectionBlock
        id={SETTINGS_SECTIONS.ai}
        label='AI model'
        showTitle={false}
      >
        <Suspense fallback={<ModelSelectionCardSkeleton />}>
          <ModelSelectionCard />
        </Suspense>
      </LedgerSectionBlock>
    </SettingsLedgerPanel>
  );
}
