import { getModelsForTier } from '@/lib/ai/ai-models';
import { validateModelForTier } from '@/lib/ai/model-resolver';
import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { AppError, ValidationError } from '@/lib/api/errors';
import { requireInternalUserByAuthId } from '@/lib/api/plans/route-context';
import { json } from '@/lib/api/response';
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
 * Returns null for preferredAiModel until the database column is added.
 */
export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ req, userId }) => {
    const { requestId, logger } = createRequestContext(req, {
      route: 'GET /api/v1/user/preferences',
      userId,
    });

    logger.info('Fetching user preferences');

    const user = await requireInternalUserByAuthId(userId);

    logger.debug('User preferences retrieved successfully');

    const userTier = await resolveUserTier(user.id);
    const availableModels = getModelsForTier(userTier);

    // TODO: [OPENROUTER-MIGRATION] Return actual user preferences when column exists:
    // return json({ preferredAiModel: user.preferredAiModel ?? DEFAULT_MODEL });

    const response = json({
      preferredAiModel: null, // Not yet implemented
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
  withAuthAndRateLimit('mutation', async ({ req, userId }) => {
    const { requestId, logger } = createRequestContext(req, {
      route: 'PATCH /api/v1/user/preferences',
      userId,
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

    const user = await requireInternalUserByAuthId(userId);

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
          const unexpectedReason = (
            modelValidation as {
              valid: false;
              reason: string;
            }
          ).reason;
          logger.warn(
            {
              reason: unexpectedReason,
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
                reason: unexpectedReason,
                preferredAiModel: parsed.data.preferredAiModel,
              },
            }
          );
        }
      }
    }

    // TODO: [OPENROUTER-MIGRATION] Save preference when column exists:
    // await updateUserModelPreference(user.id, parsed.data.preferredAiModel);

    logger.info(
      { preferredAiModel: parsed.data.preferredAiModel },
      'User preferences updated successfully'
    );

    const response = json({
      message: 'Preferences updated',
      // TODO: Return actual saved preference
      preferredAiModel: parsed.data.preferredAiModel,
    });

    return attachRequestIdHeader(response, requestId);
  })
);
