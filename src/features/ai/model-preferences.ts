/**
 * Rules for which models can be persisted as `user_preferences.preferred_ai_model` vs
 * runtime-only defaults (e.g. `openrouter/free`).
 */

import type { ModelOperation } from '@/features/ai/model-operation-policy';
import type { AvailableModel } from '@/features/ai/types/model.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { preferredAiModel } from '../../../supabase/enums';
import {
  getDefaultModelForTier,
  getModelsForTier,
} from '@/features/ai/ai-models';
import { validateModelForTier } from '@/features/ai/model-resolver';
import { logger } from '@/lib/logging/logger';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';

const PERSISTABLE_MODEL_IDS = new Set<string>(preferredAiModel.enumValues);

const RUNTIME_ONLY_MODEL_IDS = new Set<string>([AI_DEFAULT_MODEL]);

/** Router / runtime-only models (no truthful catalog pricing snapshot). */
export function isRuntimeOnlyModelId(modelId: string): boolean {
  return RUNTIME_ONLY_MODEL_IDS.has(modelId);
}

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
  tier: SubscriptionTier,
  operation: ModelOperation,
): AvailableModel[] {
  return getModelsForTier(tier, operation).filter((m) =>
    isPersistableModelId(m.id),
  );
}

export type SavedModelPreferenceSlots = {
  preferredAiModel: string | null;
  preferredRegenerationAiModel: string | null;
  preferredLessonAiModel: string | null;
};

/**
 * Which saved column feeds an operation. Starter/Free regeneration reuse the
 * single outline slot; Pro regeneration and lesson slots are independent.
 */
export function savedModelIdForOperation(
  tier: SubscriptionTier,
  saved: SavedModelPreferenceSlots,
  operation: ModelOperation,
): string | null {
  switch (operation) {
    case 'initial_outline':
      return saved.preferredAiModel;
    case 'regeneration':
      switch (tier) {
        case 'pro':
          return saved.preferredRegenerationAiModel;
        case 'starter':
        case 'free':
          return saved.preferredAiModel;
        default: {
          const _never: never = tier;
          throw new Error(`Unhandled subscription tier: ${String(_never)}`);
        }
      }
    case 'lesson':
      return saved.preferredLessonAiModel;
    default: {
      const _never: never = operation;
      throw new Error(`Unhandled model operation: ${String(_never)}`);
    }
  }
}

/**
 * Runtime model for the current tier × operation. Never writes. Out-of-tier or
 * empty saved values fall back to the operation default.
 */
export function resolveEffectivePreference(
  tier: SubscriptionTier,
  savedPreferredAiModel: string | null | undefined,
  operation: ModelOperation,
): string {
  if (savedPreferredAiModel != null && savedPreferredAiModel !== '') {
    const validation = validateModelForTier(
      tier,
      savedPreferredAiModel,
      operation,
    );
    if (validation.valid) {
      return savedPreferredAiModel;
    }
  }
  return getDefaultModelForTier(tier, operation);
}

/**
 * Resolves a stored preference for settings UI only.
 *
 * @returns The saved model id when it is persistable and allowed for the tier;
 *          `null` means no saved preference (not "use tier default" as a saved row).
 */
export function resolveSavedPreferenceForSettings(
  tier: SubscriptionTier,
  savedPreferredAiModel: string | null | undefined,
  operation: ModelOperation,
): string | null {
  if (savedPreferredAiModel == null || savedPreferredAiModel === '') {
    logger.debug(
      { tier, operation, savedPreferredAiModel },
      'No saved preferred AI model available for settings resolution',
    );
    return null;
  }
  if (!isPersistableModelId(savedPreferredAiModel)) {
    logger.debug(
      { tier, operation, savedPreferredAiModel },
      'Saved preferred AI model is not persistable for settings resolution',
    );
    return null;
  }
  const validation = validateModelForTier(
    tier,
    savedPreferredAiModel,
    operation,
  );
  if (!validation.valid) {
    logger.debug(
      { tier, operation, savedPreferredAiModel, reason: validation.reason },
      'Saved preferred AI model is not allowed for current tier in settings resolution',
    );
    return null;
  }
  return savedPreferredAiModel;
}
