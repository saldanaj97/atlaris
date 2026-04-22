/**
 * Rules for which models can be persisted as `users.preferred_ai_model` vs
 * runtime-only defaults (e.g. `openrouter/free`).
 */

import { getModelsForTier } from '@/features/ai/ai-models';
import { validateModelForTier } from '@/features/ai/model-resolver';
import type { AvailableModel } from '@/features/ai/types/model.types';
import { preferredAiModel } from '@/lib/db/enums';
import { logger } from '@/lib/logging/logger';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';
import type { SubscriptionTier } from '@/shared/types/billing.types';

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
	savedPreferredAiModel: string | null | undefined,
): string | null {
	if (savedPreferredAiModel == null || savedPreferredAiModel === '') {
		logger.debug(
			{ tier, savedPreferredAiModel },
			'No saved preferred AI model available for settings resolution',
		);
		return null;
	}
	if (!isPersistableModelId(savedPreferredAiModel)) {
		logger.debug(
			{ tier, savedPreferredAiModel },
			'Saved preferred AI model is not persistable for settings resolution',
		);
		return null;
	}
	const validation = validateModelForTier(tier, savedPreferredAiModel);
	if (!validation.valid) {
		logger.debug(
			{ tier, savedPreferredAiModel, reason: validation.reason },
			'Saved preferred AI model is not allowed for current tier in settings resolution',
		);
		return null;
	}
	return savedPreferredAiModel;
}
