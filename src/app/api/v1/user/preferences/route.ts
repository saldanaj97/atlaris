import { getDefaultModelForTier, getModelsForTier } from '@/lib/ai/ai-models';
import { validateModelForTier } from '@/lib/ai/model-resolver';
import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { AppError, ValidationError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { updateUserPreferredAiModel } from '@/lib/db/queries/users';
import {
  attachRequestIdHeader,
  createRequestContext,
} from '@/lib/logging/request-context';
import { resolveUserTier } from '@/lib/stripe/usage';
import { updatePreferencesSchema } from '@/lib/validation/user-preferences';

/**
 * GET /api/v1/user/preferences
 *
 * Retrieves the authenticated user's AI model preferences and available models.
 */
export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ req, user }) => {
    const { requestId, logger } = createRequestContext(req, {
      route: 'GET /api/v1/user/preferences',
      userId: user.id,
    });

    logger.info('Fetching user preferences');

    logger.debug('User preferences retrieved successfully');

    const userTier = await resolveUserTier(user.id);
    const availableModels = getModelsForTier(userTier);

    const fallbackModel = getDefaultModelForTier(userTier);
    let preferredAiModel = fallbackModel;

    if (user.preferredAiModel) {
      const modelValidation = validateModelForTier(
        userTier,
        user.preferredAiModel
      );

      if (modelValidation.valid) {
        preferredAiModel = user.preferredAiModel;
      } else {
        logger.warn(
          {
            storedPreferredAiModel: user.preferredAiModel,
            tier: userTier,
            reason: modelValidation.reason,
            fallbackModel,
          },
          'Stored preferred AI model is not allowed for current tier; using fallback'
        );
      }
    }

    const response = json({
      preferredAiModel,
      availableModels,
    });

    return attachRequestIdHeader(response, requestId);
  })
);

/**
 * PATCH /api/v1/user/preferences
 *
 * Updates the authenticated user's AI model preference.
 * Validates the model ID and enforces tier-gating.
 */
export const PATCH = withErrorBoundary(
  withAuthAndRateLimit('mutation', async ({ req, user }) => {
    const { requestId, logger } = createRequestContext(req, {
      route: 'PATCH /api/v1/user/preferences',
      userId: user.id,
    });

    logger.info('Updating user preferences');

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError('Invalid JSON in request body');
    }
    const parsed = updatePreferencesSchema.safeParse(body);

    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten() },
        'Invalid preferences payload'
      );
      throw new ValidationError('Invalid preferences', parsed.error.flatten());
    }

    const userTier = await resolveUserTier(user.id);
    const modelValidation = validateModelForTier(
      userTier,
      parsed.data.preferredAiModel
    );

    // Enumerate every known reason from validateModelForTier (see ModelValidationResult in
    // @/lib/ai/model-resolver). When adding a new reason there, add a case here and keep
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
            }
          );
        default: {
          const _exhaustiveCheck: never = reason;
          logger.warn(
            {
              reason: String(_exhaustiveCheck),
              preferredAiModel: parsed.data.preferredAiModel,
            },
            'Unexpected model validation reason from validateModelForTier'
          );
          throw new AppError(
            'Model validation failed for an unexpected reason.',
            {
              status: 500,
              code: 'UNKNOWN_MODEL_VALIDATION_REASON',
              details: {
                reason: String(_exhaustiveCheck),
                preferredAiModel: parsed.data.preferredAiModel,
              },
            }
          );
        }
      }
    }

    const updatedUser = await updateUserPreferredAiModel(
      user.id,
      parsed.data.preferredAiModel
    );

    if (!updatedUser) {
      throw new AppError('Failed to persist preferences.', {
        status: 500,
        code: 'PREFERENCES_UPDATE_FAILED',
      });
    }

    logger.info(
      { preferredAiModel: updatedUser.preferredAiModel },
      'User preferences updated successfully'
    );

    const response = json({
      message: 'Preferences updated',
      preferredAiModel: updatedUser.preferredAiModel,
    });

    return attachRequestIdHeader(response, requestId);
  })
);
