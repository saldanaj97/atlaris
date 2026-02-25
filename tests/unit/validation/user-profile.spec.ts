import { describe, expect, it } from 'vitest';

import {
  USER_PROFILE_NAME_MAX_LENGTH,
  updateUserProfileSchema,
} from '@/lib/validation/user-profile';

describe('updateUserProfileSchema', () => {
  it('accepts a valid name value', () => {
    const result = updateUserProfileSchema.safeParse({ name: 'Jane Doe' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Jane Doe');
    }
  });

  it('accepts null for name', () => {
    const result = updateUserProfileSchema.safeParse({ name: null });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBeNull();
    }
  });

  it('accepts names at the maximum length boundary', () => {
    const maxLengthName = 'a'.repeat(USER_PROFILE_NAME_MAX_LENGTH);
    const result = updateUserProfileSchema.safeParse({ name: maxLengthName });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe(maxLengthName);
    }
  });

  it('rejects names longer than the maximum length', () => {
    const result = updateUserProfileSchema.safeParse({
      name: 'a'.repeat(USER_PROFILE_NAME_MAX_LENGTH + 1),
    });

    expect(result.success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const result = updateUserProfileSchema.safeParse({
      name: 'Valid Name',
      email: 'should-not-be-allowed@example.com',
    });

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
