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
const preferredAiModelEnum = z.enum(preferredAiModel.enumValues, {
	error: 'Invalid model ID',
});

/**
 * `preferredAiModel: null` clears the saved preference (tier default applies).
 */
export const updatePreferencesSchema = z
	.object({
		preferredAiModel: preferredAiModelEnum.nullable(),
	})
	.strict();
