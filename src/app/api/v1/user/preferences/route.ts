import { z } from 'zod';

import { AVAILABLE_MODELS, isValidModelId } from '@/lib/ai/models';
import { withAuth, withErrorBoundary } from '@/lib/api/auth';
import { ValidationError } from '@/lib/api/errors';
import { json } from '@/lib/api/response';
import { getUserByClerkId } from '@/lib/db/queries/users';

const updatePreferencesSchema = z.object({
  preferredAiModel: z.string().refine(isValidModelId, {
    message: 'Invalid model ID',
  }),
});

/**
 * GET /api/v1/user/preferences
 *
 * Retrieves the authenticated user's AI model preferences and available models.
 * Returns null for preferredAiModel until the database column is added.
 */
export const GET = withErrorBoundary(
  withAuth(async ({ userId }) => {
    const user = await getUserByClerkId(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // TODO: [OPENROUTER-MIGRATION] Return actual user preferences when column exists:
    // return json({ preferredAiModel: user.preferredAiModel ?? DEFAULT_MODEL });

    return json({
      preferredAiModel: null, // Not yet implemented
      availableModels: AVAILABLE_MODELS,
    });
  })
);

/**
 * PATCH /api/v1/user/preferences
 *
 * Updates the authenticated user's AI model preference.
 * Validates the model ID and performs tier-gating (when implemented).
 */
export const PATCH = withErrorBoundary(
  withAuth(async ({ req, userId }) => {
    const body: unknown = await req.json();
    const parsed = updatePreferencesSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError('Invalid preferences', parsed.error.flatten());
    }

    const user = await getUserByClerkId(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // TODO: [OPENROUTER-MIGRATION] Implement tier-gating check:
    // const userTier = await resolveUserTier(user.id);
    // const model = getModelById(parsed.data.preferredAiModel);
    // if (model && model.tier === 'pro' && userTier === 'free') {
    //   throw new ValidationError('Model requires Pro subscription');
    // }

    // TODO: [OPENROUTER-MIGRATION] Save preference when column exists:
    // await updateUserModelPreference(user.id, parsed.data.preferredAiModel);

    return json({
      message: 'Preferences updated',
      // TODO: Return actual saved preference
      preferredAiModel: parsed.data.preferredAiModel,
    });
  })
);
