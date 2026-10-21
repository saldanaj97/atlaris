'use client';

import type { PreferenceField } from '@/app/(app)/settings/ai/components/save-model-preference';
import type { AvailableModel } from '@/features/ai/types/model.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { ModelSelector } from '@/app/(app)/settings/ai/components/model-selector';
import { saveModelPreference } from '@/app/(app)/settings/ai/components/save-model-preference';
import { useRouter } from 'next/navigation';

type ModelPreferencesSelectorProps = {
  currentModel: string | null;
  userTier: SubscriptionTier;
  availableModels: AvailableModel[];
  preferenceField?: PreferenceField;
  label?: string;
  showUpgradeCta?: boolean;
};

/**
 * Client bridge: persists preferred model via PATCH and refreshes server props.
 */
export function ModelPreferencesSelector({
  currentModel,
  userTier,
  availableModels,
  preferenceField = 'preferredAiModel',
  label,
  showUpgradeCta,
}: ModelPreferencesSelectorProps) {
  const router = useRouter();

  async function handleSave(modelId: string | null): Promise<void> {
    await saveModelPreference(preferenceField, modelId);
    router.refresh();
  }

  return (
    <ModelSelector
      currentModel={currentModel}
      userTier={userTier}
      availableModels={availableModels}
      onSave={handleSave}
      label={label}
      showUpgradeCta={showUpgradeCta}
    />
  );
}
