import {
  attemptMetadataWithAdmittedTier,
  readAdmittedTierFromAttemptMetadata,
} from '@/lib/db/queries/helpers/attempt-admitted-tier';
import { describe, expect, it } from 'vitest';

describe('attempt admitted tier metadata', () => {
  it('round-trips a known subscription tier', () => {
    expect(attemptMetadataWithAdmittedTier('free')).toEqual({
      admitted_tier: 'free',
    });
    expect(
      readAdmittedTierFromAttemptMetadata({ admitted_tier: 'starter' }),
    ).toBe('starter');
  });

  it('ignores missing or unknown values', () => {
    expect(readAdmittedTierFromAttemptMetadata(null)).toBeNull();
    expect(
      readAdmittedTierFromAttemptMetadata({ admitted_tier: 'gold' }),
    ).toBeNull();
    expect(
      readAdmittedTierFromAttemptMetadata({ admitted_tier: 1 }),
    ).toBeNull();
  });
});
