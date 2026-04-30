import { updatePreferencesSchema } from '@/app/api/v1/user/preferences/validation';
import { getDefaultModelForTier } from '@/features/ai/ai-models';
import { getPersistableModelsForTier } from '@/features/ai/model-preferences';
import { validateModelForTier } from '@/features/ai/model-resolver';
import { AppError, ValidationError } from '@/lib/api/errors';
import { withErrorBoundary } from '@/lib/api/route-wrappers';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { updateUserPreferredAiModel } from '@/lib/db/queries/users';
import {
  attachRequestIdHeader,
  createLoggingRequestContext,
} from '@/lib/logging/request-context';

function createPreferencesUpdateFailedError(userId: string | number): AppError {
  return new AppError('Failed to persist preferences.', {
    status: 500,
    code: 'PREFERENCES_UPDATE_FAILED',
    logMeta: { userId },
  });
}

/**
 * GET /api/v1/user/preferences
 *
 * Retrieves the authenticated user's AI model preferences and available models.
 */
export const GET = withErrorBoundary(
  requestBoundary.route({ rateLimit: 'read' }, async ({ req, actor }) => {
    const { requestId, logger } = createLoggingRequestContext(req, {
      route: 'GET /api/v1/user/preferences',
      userId: actor.id,
    });

    const userTier = actor.subscriptionTier;
    const availableModels = getPersistableModelsForTier(userTier);

    const fallbackModel = getDefaultModelForTier(userTier);
    let preferredAiModel = fallbackModel;

    if (actor.preferredAiModel) {
      const modelValidation = validateModelForTier(
        userTier,
        actor.preferredAiModel,
      );

      if (modelValidation.valid) {
        preferredAiModel = actor.preferredAiModel;
      } else {
        logger.warn(
          {
            storedPreferredAiModel: actor.preferredAiModel,
            tier: userTier,
            reason: modelValidation.reason,
            fallbackModel,
          },
          'Stored preferred AI model is not allowed for current tier; using fallback',
        );
      }
    }

    const response = json({
      preferredAiModel,
      availableModels,
    });

    return attachRequestIdHeader(response, requestId);
  }),
);

/**
 * PATCH /api/v1/user/preferences
 *
 * Updates the authenticated user's AI model preference.
 * Validates the model ID and enforces tier-gating.
 */
export const PATCH = withErrorBoundary(
  requestBoundary.route({ rateLimit: 'mutation' }, async ({ req, actor }) => {
    const { requestId, logger } = createLoggingRequestContext(req, {
      route: 'PATCH /api/v1/user/preferences',
      userId: actor.id,
    });

    logger.info('Updating user preferences');

    const body = await parseJsonBody(req, {
      mode: 'required',
      onMalformedJson: () =>
        new ValidationError('Invalid JSON in request body'),
    });
    const parsed = updatePreferencesSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid preferences', parsed.error.flatten(), {
        errors: parsed.error.flatten(),
      });
    }

    const userTier = actor.subscriptionTier;

    if (parsed.data.preferredAiModel === null) {
      const updatedUser = await updateUserPreferredAiModel(actor.id, null);

      if (!updatedUser) {
        throw createPreferencesUpdateFailedError(actor.id);
      }

      logger.info(
        { preferredAiModel: updatedUser.preferredAiModel },
        'User preferences cleared (tier default applies)',
      );

      const response = json({
        message: 'Preferences updated',
        preferredAiModel: updatedUser.preferredAiModel,
      });

      return attachRequestIdHeader(response, requestId);
    }

    const modelValidation = validateModelForTier(
      userTier,
      parsed.data.preferredAiModel,
    );

    // Enumerate every known reason from validateModelForTier (see ModelValidationResult in
    // @/features/ai/model-resolver). When adding a new reason there, add a case here and keep
    // the default branch for unexpected values. AppError: @/lib/api/errors.
    if (!modelValidation.valid) {
      const reason = modelValidation.reason;
      switch (reason) {
        case 'invalid_model':
          throw new AppError('Model is not recognized.', {
            status: 400,
            code: 'MODEL_INVALID',
            details: {
              preferredAiModel: parsed.data.preferredAiModel,
            },
          });
        case 'tier_denied':
          throw new AppError(
            'Model is not allowed for your subscription tier.',
            {
              status: 403,
              code: 'MODEL_NOT_ALLOWED_FOR_TIER',
              details: {
                preferredAiModel: parsed.data.preferredAiModel,
                tier: userTier,
              },
            },
          );
        default: {
          const _exhaustiveCheck: never = reason;
          throw new AppError(
            'Model validation failed for an unexpected reason.',
            {
              status: 500,
              code: 'UNKNOWN_MODEL_VALIDATION_REASON',
              details: {
                reason: String(_exhaustiveCheck),
                preferredAiModel: parsed.data.preferredAiModel,
              },
              logMeta: {
                reason: String(_exhaustiveCheck),
                preferredAiModel: parsed.data.preferredAiModel,
              },
            },
          );
        }
      }
    }

    const updatedUser = await updateUserPreferredAiModel(
      actor.id,
      parsed.data.preferredAiModel,
    );

    if (!updatedUser) {
      throw createPreferencesUpdateFailedError(actor.id);
    }

    if (updatedUser.preferredAiModel === null) {
      throw new AppError('Failed to persist preference value.', {
        status: 500,
        code: 'PREFERENCES_PERSISTED_NULL',
        logMeta: { userId: actor.id },
      });
    }

    logger.info(
      { preferredAiModel: updatedUser.preferredAiModel },
      'User preferences updated successfully',
    );

    const response = json({
      message: 'Preferences updated',
      preferredAiModel: updatedUser.preferredAiModel,
    });

    return attachRequestIdHeader(response, requestId);
  }),
);
