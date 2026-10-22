/**
 * Rules for which models can be persisted as user preference slots vs
 * runtime-only defaults (e.g. `openrouter/free`).
 *
 * Persistability comes from the current operation policy catalogs, not the
 * legacy PostgreSQL `preferred_ai_model` enum.
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
  isValidModelId,
} from '@/features/ai/ai-models';
import { getGroundedOperationPolicy } from '@/features/ai/model-operation-policy';
import { validateModelForTier } from '@/features/ai/model-resolver';
import { logger } from '@/lib/logging/logger';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';

const RUNTIME_ONLY_MODEL_IDS = new Set<string>([AI_DEFAULT_MODEL]);

/** Router / runtime-only models (no truthful catalog pricing snapshot). */
export function isRuntimeOnlyModelId(modelId: string): boolean {
  return RUNTIME_ONLY_MODEL_IDS.has(modelId);
}

/**
 * Model IDs that may be stored as a saved preference and shown as explicit
 * save targets in settings. Membership is the current catalog minus runtime
 * router fallbacks such as `openrouter/free`.
 */
export function isPersistableModelId(modelId: string): boolean {
  return isValidModelId(modelId) && !isRuntimeOnlyModelId(modelId);
}

/**
 * Models the user may pick in AI settings: the current tier × operation
 * policy catalog excluding runtime-only routers.
 */
export function getPersistableModelsForTier(
  tier: SubscriptionTier,
  operation: ModelOperation,
): AvailableModel[] {
  return getModelsForTier(tier, operation).filter(
    (m) => !isRuntimeOnlyModelId(m.id),
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
 * Prefer an explicit override when present; otherwise the saved slot for this
 * tier × operation. Does not validate catalog membership — callers pass the
 * result to `resolveModelForTier` / `processGenerationAttempt`.
 */
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
 * @returns The saved model id when it is persistable and allowed for the current
 *          tier × operation; `null` means no saved preference to show in the picker.
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

/*
 * Grounded generation (JCS-157). Pro users pick the writer, verifier and
 * advisor models from the role catalogs in `model-operation-policy.ts`. These
 * picks live in their own slots so the legacy ones above stay unchanged.
 */

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

/** The writer, verifier and advisor roles share one catalog per role. */
const GROUNDED_OPERATION_BY_PICK_ROLE = {
  writer: 'initial_outline',
  verifier: 'outline_verify',
  advisor: 'advisor',
} as const satisfies Record<GroundedPickRole, GroundedOperation>;

/** Models a Pro user may pick for `role`. */
export function getGroundedPickCatalog(
  role: GroundedPickRole,
): readonly string[] {
  const policy = getGroundedOperationPolicy(
    'pro',
    GROUNDED_OPERATION_BY_PICK_ROLE[role],
  );
  return policy.allowed ? policy.catalog : [];
}

/** The tier's code-owned primary model for `role`; `null` when it does not run. */
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

/** Whether `tier` may save `modelId` as its `role` pick. Only Pro may. */
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

/**
 * The saved pick to lead the `role` route, or `null` for the tier's code-owned
 * models. A downgraded user's pick is ignored here but stays stored, so it
 * applies again if they return to Pro. Never writes.
 */
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

/**
 * The writer model to lead a grounded call (JCS-169): an explicit
 * per-request override in the tier's writer catalog, else the saved Pro writer
 * pick. An off-catalog override falls through rather than masking the pick.
 * The legacy slots above never apply to grounded runs. `null` runs the tier's
 * code-owned writers.
 */
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
