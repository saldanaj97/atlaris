import { z } from 'zod';

import { isValidModelId } from '@/lib/ai/ai-models';

/**
 * Schema for updating user preferences.
 *
 * Used by:
 * - API route: src/app/api/v1/user/preferences/route.ts
 * - Unit tests: tests/unit/api/model-validation.spec.ts
 *
 * @module lib/validation/user-preferences
 */
export const updatePreferencesSchema = z.object({
  preferredAiModel: z.string().refine(isValidModelId, {
    message: 'Invalid model ID',
  }),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
