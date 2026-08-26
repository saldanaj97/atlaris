import type { ModelOperation } from '@/features/ai/model-operation-policy';
import type { SavedModelPreferenceSlots } from '@/features/ai/model-preferences';
import type { UserModelPreferencePatch } from '@/lib/db/queries/user-preferences';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { updatePreferencesSchema } from '@/app/api/v1/user/preferences/validation';
import { getDefaultModelForTier } from '@/features/ai/ai-models';
import {
  getPersistableModelsForTier,
  isRuntimeOnlyModelId,
  resolveEffectivePreference,
  savedModelIdForOperation,
} from '@/features/ai/model-preferences';
import { validateModelForTier } from '@/features/ai/model-resolver';
import { AppError, ValidationError } from '@/lib/api/errors';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { upsertUserModelPreferences } from '@/lib/db/queries/user-preferences';
import {
  attachRequestIdHeader,
  createLoggingRequestContext,
} from '@/lib/logging/request-context';

type PreferenceSlot = keyof SavedModelPreferenceSlots;

function createPreferencesUpdateFailedError(userId: string | number): AppError {
  return new AppError('Failed to persist preferences.', {
    status: 500,
    code: 'PREFERENCES_UPDATE_FAILED',
    logMeta: { userId },
  });
}

function createModelNotAllowedError(
  preferredAiModel: string,
  tier: SubscriptionTier,
): AppError {
  return new AppError('Model is not allowed for your subscription tier.', {
    status: 403,
    code: 'MODEL_NOT_ALLOWED_FOR_TIER',
    details: {
      preferredAiModel,
      tier,
    },
  });
}

function operationForSlot(slot: PreferenceSlot): ModelOperation {
  switch (slot) {
    case 'preferredAiModel':
      return 'initial_outline';
    case 'preferredRegenerationAiModel':
      return 'regeneration';
    case 'preferredLessonAiModel':
      return 'lesson';
    default: {
      const _never: never = slot;
      throw new Error(`Unhandled preference slot: ${String(_never)}`);
    }
  }
}

function throwForInvalidModel(
  reason: 'invalid_model' | 'tier_denied',
  modelId: string,
  tier: SubscriptionTier,
): never {
  switch (reason) {
    case 'invalid_model':
      throw new AppError('Model is not recognized.', {
        status: 400,
        code: 'MODEL_INVALID',
        details: {
          preferredAiModel: modelId,
        },
      });
    case 'tier_denied':
      throw createModelNotAllowedError(modelId, tier);
    default: {
      const _exhaustiveCheck: never = reason;
      throw new AppError('Model validation failed for an unexpected reason.', {
        status: 500,
        code: 'UNKNOWN_MODEL_VALIDATION_REASON',
        details: {
          reason: String(_exhaustiveCheck),
          preferredAiModel: modelId,
        },
        logMeta: {
          reason: String(_exhaustiveCheck),
          preferredAiModel: modelId,
        },
      });
    }
  }
}

function assertCanPersistSlot(
  tier: SubscriptionTier,
  slot: PreferenceSlot,
  modelId: string | null | undefined,
): void {
  if (modelId === undefined || modelId === null) {
    return;
  }

  const operation = operationForSlot(slot);
  const modelValidation = validateModelForTier(tier, modelId, operation);
  if (!modelValidation.valid) {
    throwForInvalidModel(modelValidation.reason, modelId, tier);
  }

  switch (tier) {
    case 'free':
      throw createModelNotAllowedError(modelId, tier);
    case 'starter':
      if (slot !== 'preferredAiModel') {
        throw createModelNotAllowedError(modelId, tier);
      }
      break;
    case 'pro':
      break;
    default: {
      const _never: never = tier;
      throw new Error(`Unhandled subscription tier: ${String(_never)}`);
    }
  }

  if (isRuntimeOnlyModelId(modelId)) {
    throw createModelNotAllowedError(modelId, tier);
  }
}

function savedSlotsFromActor(actor: {
  preferredAiModel: string | null;
  preferredRegenerationAiModel: string | null;
  preferredLessonAiModel: string | null;
}): SavedModelPreferenceSlots {
  return {
    preferredAiModel: actor.preferredAiModel,
    preferredRegenerationAiModel: actor.preferredRegenerationAiModel,
    preferredLessonAiModel: actor.preferredLessonAiModel,
  };
}

function toPreferencesGetResponse(
  tier: SubscriptionTier,
  saved: SavedModelPreferenceSlots,
) {
  return {
    preferredAiModel: saved.preferredAiModel,
    preferredRegenerationAiModel: saved.preferredRegenerationAiModel,
    preferredLessonAiModel: saved.preferredLessonAiModel,
    effectivePreferredAiModel: resolveEffectivePreference(
      tier,
      savedModelIdForOperation(tier, saved, 'initial_outline'),
      'initial_outline',
    ),
    effectivePreferredRegenerationAiModel: resolveEffectivePreference(
      tier,
      savedModelIdForOperation(tier, saved, 'regeneration'),
      'regeneration',
    ),
    effectivePreferredLessonAiModel: resolveEffectivePreference(
      tier,
      savedModelIdForOperation(tier, saved, 'lesson'),
      'lesson',
    ),
    availableModels: getPersistableModelsForTier(tier, 'initial_outline'),
  };
}

function toPreferencesPatchResponse(saved: SavedModelPreferenceSlots) {
  return {
    message: 'Preferences updated' as const,
    preferredAiModel: saved.preferredAiModel,
    preferredRegenerationAiModel: saved.preferredRegenerationAiModel,
    preferredLessonAiModel: saved.preferredLessonAiModel,
  };
}

/**
 * GET /api/v1/user/preferences
 *
 * Returns raw saved model slots (nullable, including out-of-tier IDs) plus
 * effective resolved IDs for the current tier. Never writes.
 */
export const GET = requestBoundary.route(
  { rateLimit: 'read' },
  async ({ req, actor }) => {
    const { requestId, logger } = createLoggingRequestContext(req, {
      route: 'GET /api/v1/user/preferences',
      userId: actor.id,
    });

    const userTier = actor.subscriptionTier;
    const saved = savedSlotsFromActor(actor);
    const fallbackModel = getDefaultModelForTier(userTier, 'initial_outline');

    if (actor.preferredAiModel) {
      const modelValidation = validateModelForTier(
        userTier,
        actor.preferredAiModel,
        'initial_outline',
      );
      if (!modelValidation.valid) {
        logger.warn(
          {
            storedPreferredAiModel: actor.preferredAiModel,
            tier: userTier,
            reason: modelValidation.reason,
            fallbackModel,
          },
          'Stored preferred AI model is not allowed for current tier; using fallback as effective only',
        );
      }
    }

    const response = json(toPreferencesGetResponse(userTier, saved));
    return attachRequestIdHeader(response, requestId);
  },
);

/**
 * PATCH /api/v1/user/preferences
 *
 * Updates saved model preference slots. Validates each provided ID against the
 * current tier × operation policy. Does not rewrite out-of-tier saved values
 * on GET; those are rejected here if the client tries to persist them.
 */
export const PATCH = requestBoundary.route(
  { rateLimit: 'mutation' },
  async ({ req, actor, db }) => {
    const { requestId, logger } = createLoggingRequestContext(req, {
      route: 'PATCH /api/v1/user/preferences',
      userId: actor.id,
    });

    logger.info('Updating user preferences');

    const body = await parseJsonBody(req, {
      mode: 'required',
      onMalformedJson: () =>
        new ValidationError('Invalid JSON in request body'),
      maxBytes: 256 * 1024,
    });
    const parsed = updatePreferencesSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.flatten();
      throw new ValidationError('Invalid preferences', errors, { errors });
    }

    const userTier = actor.subscriptionTier;
    const patch: UserModelPreferencePatch = parsed.data;

    assertCanPersistSlot(userTier, 'preferredAiModel', patch.preferredAiModel);
    assertCanPersistSlot(
      userTier,
      'preferredRegenerationAiModel',
      patch.preferredRegenerationAiModel,
    );
    assertCanPersistSlot(
      userTier,
      'preferredLessonAiModel',
      patch.preferredLessonAiModel,
    );

    const updatedPreferences = await upsertUserModelPreferences(
      actor.id,
      patch,
      db,
    );

    if (!updatedPreferences) {
      throw createPreferencesUpdateFailedError(actor.id);
    }

    if (
      patch.preferredAiModel != null &&
      updatedPreferences.preferredAiModel === null
    ) {
      throw new AppError('Failed to persist preference value.', {
        status: 500,
        code: 'PREFERENCES_PERSISTED_NULL',
        logMeta: { userId: actor.id },
      });
    }

    logger.info(
      {
        preferredAiModel: updatedPreferences.preferredAiModel,
        preferredRegenerationAiModel:
          updatedPreferences.preferredRegenerationAiModel,
        preferredLessonAiModel: updatedPreferences.preferredLessonAiModel,
      },
      'User preferences updated successfully',
    );

    const response = json(toPreferencesPatchResponse(updatedPreferences));
    return attachRequestIdHeader(response, requestId);
  },
);
