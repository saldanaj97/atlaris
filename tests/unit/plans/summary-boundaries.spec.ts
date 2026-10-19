import { getGenerationAttemptCap } from '@/features/ai/generation-policy';
import { derivePlanReadStatus } from '@/features/plans/read-projection/read-status';
import { describe, expect, it } from 'vitest';

describe('plan summary status boundaries', () => {
  it('derivePlanReadStatus treats modules as ground truth over failed generationStatus', () => {
    const attemptCap = getGenerationAttemptCap();

    expect(
      derivePlanReadStatus({
        generationStatus: 'failed',
        hasModules: true,
        attemptsCount: attemptCap,
        attemptCap,
      }),
    ).toBe('ready');
  });
});
