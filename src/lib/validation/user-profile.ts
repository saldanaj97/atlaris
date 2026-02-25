import { z } from 'zod';

export const USER_PROFILE_NAME_MAX_LENGTH = 100;

export const updateUserProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(USER_PROFILE_NAME_MAX_LENGTH).nullable(),
  })
  .strict();

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
