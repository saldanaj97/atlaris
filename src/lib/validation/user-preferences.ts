import { z } from 'zod';

import { preferredAiModel } from '@/lib/db/enums';

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
  preferredAiModel: z.enum(preferredAiModel.enumValues, {
    error: 'Invalid model ID',
  }),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
