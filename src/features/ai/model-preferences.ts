/**
 * Rules for which models can be persisted as `users.preferred_ai_model` vs
 * runtime-only defaults (e.g. `openrouter/free`).
 */

import { getModelsForTier } from '@/features/ai/ai-models';
import { validateModelForTier } from '@/features/ai/model-resolver';
import type {
  AvailableModel,
  SubscriptionTier,
} from '@/features/ai/types/model.types';
import { preferredAiModel } from '@/lib/db/enums';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';

const PERSISTABLE_MODEL_IDS = new Set<string>(preferredAiModel.enumValues);

const RUNTIME_ONLY_MODEL_IDS = new Set<string>([AI_DEFAULT_MODEL]);

/**
 * Model IDs that may be stored in `preferred_ai_model` (DB enum) and shown as
 * explicit save targets in settings. Excludes runtime router fallbacks.
 */
export function isPersistableModelId(modelId: string): boolean {
  return (
    PERSISTABLE_MODEL_IDS.has(modelId) && !RUNTIME_ONLY_MODEL_IDS.has(modelId)
  );
}

/**
 * Models the user may pick in AI settings: tier-filtered catalog intersected
 * with persistable enum values. `openrouter/free` is never listed here.
 */
export function getPersistableModelsForTier(
  tier: SubscriptionTier
): AvailableModel[] {
  return getModelsForTier(tier).filter((m) => isPersistableModelId(m.id));
}

/**
 * Resolves a stored preference for settings UI only.
 *
 * @returns The saved model id when it is persistable and allowed for the tier;
 *          `null` means no saved preference (not "use tier default" as a saved row).
 */
export function resolveSavedPreferenceForSettings(
  tier: SubscriptionTier,
  savedPreferredAiModel: string | null | undefined
): string | null {
  if (savedPreferredAiModel == null || savedPreferredAiModel === '') {
    return null;
  }
  if (!isPersistableModelId(savedPreferredAiModel)) {
    return null;
  }
  const validation = validateModelForTier(tier, savedPreferredAiModel);
  if (!validation.valid) {
    return null;
  }
  return savedPreferredAiModel;
}
