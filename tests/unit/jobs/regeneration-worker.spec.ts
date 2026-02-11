import { drainRegenerationQueue } from '@/lib/jobs/regeneration-worker';
import { describe, expect, it } from 'vitest';

describe('drainRegenerationQueue', () => {
  it('does no work when maxJobs is 0 (no-op)', async () => {
    const result = await drainRegenerationQueue({ maxJobs: 0 });
    expect(result).toEqual({
      processedCount: 0,
      completedCount: 0,
      failedCount: 0,
    });
  });
});
