import {
  USER_PROFILE_NAME_MAX_LENGTH,
  updateUserProfileSchema,
} from '@/app/api/v1/user/profile/validation';
import { describe, expect, it } from 'vitest';

describe('updateUserProfileSchema', () => {
  it('accepts names at the maximum length boundary', () => {
    const maxLengthName = 'a'.repeat(USER_PROFILE_NAME_MAX_LENGTH);
    const result = updateUserProfileSchema.safeParse({ name: maxLengthName });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe(maxLengthName);
    }
  });

  it('rejects empty updates', () => {
    const result = updateUserProfileSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it('rejects empty name values', () => {
    const result = updateUserProfileSchema.safeParse({ name: '' });

    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only name values', () => {
    const result = updateUserProfileSchema.safeParse({ name: '   ' });

    expect(result.success).toBe(false);
  });
});
