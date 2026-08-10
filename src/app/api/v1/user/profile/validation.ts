import { z } from 'zod';

export const USER_PROFILE_NAME_MAX_LENGTH = 100;

function isValidTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export const updateUserProfileSchema = z
  .strictObject({
    name: z
      .string()
      .trim()
      .min(1)
      .max(USER_PROFILE_NAME_MAX_LENGTH)
      .nullable()
      .optional(),
    analyticsTimezone: z.string().trim().refine(isValidTimeZone).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.analyticsTimezone !== undefined,
    {
      message: 'At least one profile field is required',
    },
  );
