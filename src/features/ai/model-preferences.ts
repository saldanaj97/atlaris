/**
 * Rules for which models can be persisted as user preference slots vs
 * runtime-only defaults (e.g. `openrouter/free`).
 *
 * Tier access comes from the operation policy and the synced guardrail
 * models, not the old PostgreSQL `preferred_ai_model` enum.
 */

import type {
  GroundedOperation,
  ModelOperation,
} from '@/features/ai/model-operation-policy';
import type { AvailableModel } from '@/features/ai/types/model.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  getDefaultModelForTier,
  getModelsForTier,
} from '@/features/ai/ai-models';
import { getTierModels } from '@/features/ai/model-catalog/catalog';
import {
  getGroundedOperationPolicy,
  getModelOperationPolicy,
  PICKER_HIDDEN_MODEL_IDS_BY_TIER,
} from '@/features/ai/model-operation-policy';
import { validateModelForTier } from '@/features/ai/model-resolver';
import { logger } from '@/lib/logging/logger';
import { AI_DEFAULT_MODEL, isModelIdShape } from '@/shared/constants/ai-models';

const RUNTIME_ONLY_MODEL_IDS = new Set<string>([AI_DEFAULT_MODEL]);

export function isRuntimeOnlyModelId(modelId: string): boolean {
  return RUNTIME_ONLY_MODEL_IDS.has(modelId);
}

/**
 * Model IDs that may be stored as a saved preference: a model slug other than
 * runtime router fallbacks such as `openrouter/free`. Whether the tier may use
 * it is `validateModelForTier`'s check.
 */
export function isPersistableModelId(modelId: string): boolean {
  return isModelIdShape(modelId) && !isRuntimeOnlyModelId(modelId);
}

/**
 * Models the user may pick in AI settings: the current tier × operation
 * policy catalog excluding runtime-only routers. Only Pro picks a lesson
 * model; other tiers' lessons are code-owned.
 */
export async function getPersistableModelsForTier(
  tier: SubscriptionTier,
  operation: ModelOperation,
): Promise<AvailableModel[]> {
  if (operation === 'lesson' && tier !== 'pro') {
    return [];
  }
  return (await getModelsForTier(tier, operation)).filter(
    (m) => !isRuntimeOnlyModelId(m.id),
  );
}

export async function getProOnlyModelsForTier(
  tier: SubscriptionTier,
  operation: ModelOperation,
): Promise<AvailableModel[]> {
  if (
    tier !== 'starter' ||
    operation === 'lesson' ||
    !getModelOperationPolicy(tier, operation).usesTierCatalog
  ) {
    return [];
  }
  const [starterModels, proModels] = await Promise.all([
    getTierModels('starter'),
    getTierModels('pro'),
  ]);
  const hiddenModelIds: readonly string[] =
    PICKER_HIDDEN_MODEL_IDS_BY_TIER.starter;
  const starterModelIds = new Set(starterModels.map((model) => model.id));
  // Disjoint by construction: hidden models are on the Starter guardrail, the
  // Pro ones are not, so each id appears once.
  return [
    ...starterModels.filter((model) => hiddenModelIds.includes(model.id)),
    ...proModels.filter((model) => !starterModelIds.has(model.id)),
  ].filter((model) => !isRuntimeOnlyModelId(model.id));
}

export type SavedModelPreferenceSlots = {
  preferredAiModel: string | null;
  preferredRegenerationAiModel: string | null;
  preferredLessonAiModel: string | null;
};

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
      return tier === 'pro' ? saved.preferredLessonAiModel : null;
    default: {
      const _never: never = operation;
      throw new Error(`Unhandled model operation: ${String(_never)}`);
    }
  }
}

export function resolveOverrideOrSavedModelId(
  override: string | null | undefined,
  tier: SubscriptionTier,
  saved: SavedModelPreferenceSlots,
  operation: ModelOperation,
): string | undefined {
  if (override != null && override !== '') {
    return override;
  }
  return savedModelIdForOperation(tier, saved, operation) ?? undefined;
}

export async function resolveEffectivePreference(
  tier: SubscriptionTier,
  savedPreferredAiModel: string | null | undefined,
  operation: ModelOperation,
): Promise<string> {
  if (savedPreferredAiModel != null && savedPreferredAiModel !== '') {
    const validation = await validateModelForTier(
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

export async function resolveSavedPreferenceForSettings(
  tier: SubscriptionTier,
  savedPreferredAiModel: string | null | undefined,
  operation: ModelOperation,
): Promise<string | null> {
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
  const validation = await validateModelForTier(
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

export const GROUNDED_PICK_ROLES = ['writer', 'verifier', 'advisor'] as const;

/**
 * Clerk plan feature (on the Pro plan) that lets a user save grounded picks and
 * see their pickers. Workers have no Clerk session, so runs stay tier-based.
 */
export const GROUNDED_MODEL_PICKS_FEATURE = 'grounded_model_picks';

export type GroundedPickRole = (typeof GROUNDED_PICK_ROLES)[number];

export type SavedGroundedModelPicks = {
  preferredWriterAiModel: string | null;
  preferredVerifierAiModel: string | null;
  preferredAdvisorAiModel: string | null;
};

export const GROUNDED_PICK_FIELD_BY_ROLE = {
  writer: 'preferredWriterAiModel',
  verifier: 'preferredVerifierAiModel',
  advisor: 'preferredAdvisorAiModel',
} as const satisfies Record<GroundedPickRole, keyof SavedGroundedModelPicks>;

const GROUNDED_OPERATION_BY_PICK_ROLE = {
  writer: 'initial_outline',
  verifier: 'outline_verify',
  advisor: 'advisor',
} as const satisfies Record<GroundedPickRole, GroundedOperation>;

export function getGroundedPickCatalog(
  role: GroundedPickRole,
): readonly string[] {
  const policy = getGroundedOperationPolicy(
    'pro',
    GROUNDED_OPERATION_BY_PICK_ROLE[role],
  );
  return policy.allowed ? policy.catalog : [];
}

export function getGroundedPickDefault(
  tier: SubscriptionTier,
  role: GroundedPickRole,
): string | null {
  const policy = getGroundedOperationPolicy(
    tier,
    GROUNDED_OPERATION_BY_PICK_ROLE[role],
  );
  return policy.allowed ? policy.models[0].modelId : null;
}

export type GroundedPickValidation =
  | { valid: true }
  | { valid: false; reason: 'tier_denied' | 'invalid_model' };

export function validateGroundedPick(
  tier: SubscriptionTier,
  role: GroundedPickRole,
  modelId: string,
): GroundedPickValidation {
  if (tier !== 'pro') {
    return { valid: false, reason: 'tier_denied' };
  }
  if (!getGroundedPickCatalog(role).includes(modelId)) {
    return { valid: false, reason: 'invalid_model' };
  }
  return { valid: true };
}

export function resolveGroundedModelPick(
  tier: SubscriptionTier,
  saved: SavedGroundedModelPicks,
  role: GroundedPickRole,
): string | null {
  const modelId = saved[GROUNDED_PICK_FIELD_BY_ROLE[role]];
  if (modelId == null || modelId === '') {
    return null;
  }
  return validateGroundedPick(tier, role, modelId).valid ? modelId : null;
}

export function resolveGroundedWriterModelId(
  tier: SubscriptionTier,
  override: string | null | undefined,
  saved: SavedGroundedModelPicks,
): string | null {
  if (
    override != null &&
    override !== '' &&
    validateGroundedPick(tier, 'writer', override).valid
  ) {
    return override;
  }
  return resolveGroundedModelPick(tier, saved, 'writer');
}
