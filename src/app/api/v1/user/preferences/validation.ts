import { z } from 'zod';

/**
 * Schema for updating user preferences.
 *
 * Model IDs are server-validated text. The route enforces the current
 * tier × operation policy; this schema only checks shape.
 *
 * Used by:
 * - API route: src/app/api/v1/user/preferences/route.ts
 * - Unit tests: tests/unit/api/model-validation.spec.ts
 */
const savedModelIdSchema = z
  .string({ error: 'Invalid model ID' })
  .min(1, { error: 'Invalid model ID' })
  .nullable();

/**
 * `null` on a provided slot clears that saved preference (tier default applies
 * as the effective value only). At least one slot is required.
 */
export const updatePreferencesSchema = z
  .strictObject({
    preferredAiModel: savedModelIdSchema.optional(),
    preferredRegenerationAiModel: savedModelIdSchema.optional(),
    preferredLessonAiModel: savedModelIdSchema.optional(),
  })
  .refine(
    (value) =>
      value.preferredAiModel !== undefined ||
      value.preferredRegenerationAiModel !== undefined ||
      value.preferredLessonAiModel !== undefined,
    {
      message: 'At least one model preference is required',
    },
  );
