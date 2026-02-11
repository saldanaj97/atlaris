import { drainRegenerationQueue } from '@/lib/jobs/regeneration-worker';
import { describe, expect, it, vi } from 'vitest';

describe('drainRegenerationQueue', () => {
  it('does no work when maxJobs is 0 (no-op)', async () => {
    const processNextJob = vi.fn();
    const result = await drainRegenerationQueue({ maxJobs: 0, processNextJob });

    expect(result).toEqual({
      processedCount: 0,
      completedCount: 0,
      failedCount: 0,
    });
    expect(processNextJob).not.toHaveBeenCalled();
  });

  it('returns empty-queue counters when no job is available', async () => {
    const processNextJob = vi.fn().mockResolvedValue({ processed: false });
    const result = await drainRegenerationQueue({ maxJobs: 3, processNextJob });

    expect(result).toEqual({
      processedCount: 0,
      completedCount: 0,
      failedCount: 0,
    });
    expect(processNextJob).toHaveBeenCalledTimes(1);
  });

  it('counts completed jobs as successful processing', async () => {
    const processNextJob = vi
      .fn()
      .mockResolvedValueOnce({ processed: true, status: 'completed' })
      .mockResolvedValueOnce({ processed: false });

    const result = await drainRegenerationQueue({ maxJobs: 5, processNextJob });

    expect(result).toEqual({
      processedCount: 1,
      completedCount: 1,
      failedCount: 0,
    });
    expect(processNextJob).toHaveBeenCalledTimes(2);
  });

  it('counts failed jobs when processing fails', async () => {
    const processNextJob = vi
      .fn()
      .mockResolvedValueOnce({ processed: true, status: 'failed' })
      .mockResolvedValueOnce({ processed: false });

    const result = await drainRegenerationQueue({ maxJobs: 5, processNextJob });

    expect(result).toEqual({
      processedCount: 1,
      completedCount: 0,
      failedCount: 1,
    });
    expect(processNextJob).toHaveBeenCalledTimes(2);
  });

  it('handles mixed outcomes until queue empties', async () => {
    const processNextJob = vi
      .fn()
      .mockResolvedValueOnce({ processed: true, status: 'completed' })
      .mockResolvedValueOnce({ processed: true, status: 'failed' })
      .mockResolvedValueOnce({ processed: true, status: 'completed' })
      .mockResolvedValueOnce({ processed: false });

    const result = await drainRegenerationQueue({
      maxJobs: 10,
      processNextJob,
    });

    expect(result).toEqual({
      processedCount: 3,
      completedCount: 2,
      failedCount: 1,
    });
    expect(processNextJob).toHaveBeenCalledTimes(4);
  });
});
