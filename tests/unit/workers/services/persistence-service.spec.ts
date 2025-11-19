import * as dbUsage from '@/lib/db/usage';
import * as jobQueue from '@/lib/jobs/queue';
import * as stripeUsage from '@/lib/stripe/usage';
import { PersistenceService } from '@/workers/services/persistence-service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/jobs/queue');
vi.mock('@/lib/stripe/usage');
vi.mock('@/lib/db/usage');

describe('PersistenceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('completeJob', () => {
    it('should mark job as completed and record usage', async () => {
      const service = new PersistenceService();

      vi.mocked(jobQueue.completeJob).mockResolvedValue(null);
      vi.mocked(stripeUsage.markPlanGenerationSuccess).mockResolvedValue(
        undefined
      );
      vi.mocked(dbUsage.recordUsage).mockResolvedValue(undefined);

      await service.completeJob({
        jobId: 'job-123',
        planId: 'plan-123',
        userId: 'user-123',
        result: {
          modulesCount: 3,
          tasksCount: 10,
          durationMs: 5000,
          metadata: {
            provider: {
              provider: 'openai',
              model: 'gpt-4o-mini',
              usage: {
                promptTokens: 100,
                completionTokens: 200,
              },
            },
            attemptId: 'attempt-123',
          },
        },
        metadata: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          usage: {
            promptTokens: 100,
            completionTokens: 200,
          },
        },
      });

      expect(jobQueue.completeJob).toHaveBeenCalledWith('job-123', {
        modulesCount: 3,
        tasksCount: 10,
        durationMs: 5000,
        metadata: {
          provider: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            usage: {
              promptTokens: 100,
              completionTokens: 200,
            },
          },
          attemptId: 'attempt-123',
        },
      });

      expect(stripeUsage.markPlanGenerationSuccess).toHaveBeenCalledWith(
        'plan-123'
      );

      expect(dbUsage.recordUsage).toHaveBeenCalledWith({
        userId: 'user-123',
        provider: 'openai',
        model: 'gpt-4o-mini',
        inputTokens: 100,
        outputTokens: 200,
        costCents: 0,
        kind: 'plan',
      });
    });

    it('should handle missing metadata gracefully', async () => {
      const service = new PersistenceService();

      vi.mocked(jobQueue.completeJob).mockResolvedValue(null);
      vi.mocked(stripeUsage.markPlanGenerationSuccess).mockResolvedValue(
        undefined
      );
      vi.mocked(dbUsage.recordUsage).mockResolvedValue(undefined);

      await service.completeJob({
        jobId: 'job-123',
        planId: 'plan-123',
        userId: 'user-123',
        result: {
          modulesCount: 3,
          tasksCount: 10,
          durationMs: 5000,
        },
      });

      expect(jobQueue.completeJob).toHaveBeenCalledWith('job-123', {
        modulesCount: 3,
        tasksCount: 10,
        durationMs: 5000,
      });

      expect(stripeUsage.markPlanGenerationSuccess).toHaveBeenCalledWith(
        'plan-123'
      );

      expect(dbUsage.recordUsage).toHaveBeenCalledWith({
        userId: 'user-123',
        provider: 'unknown',
        model: 'unknown',
        inputTokens: undefined,
        outputTokens: undefined,
        costCents: 0,
        kind: 'plan',
      });
    });
  });

  describe('failJob', () => {
    it('should mark job as failed with retryable option', async () => {
      const service = new PersistenceService();

      vi.mocked(jobQueue.failJob).mockResolvedValue(null);

      await service.failJob({
        jobId: 'job-123',
        planId: 'plan-123',
        userId: 'user-123',
        error: 'Provider timeout',
        retryable: true,
      });

      expect(jobQueue.failJob).toHaveBeenCalledWith(
        'job-123',
        'Provider timeout',
        { retryable: true }
      );

      // Should not mark plan as failed or record usage for retryable failures
      expect(stripeUsage.markPlanGenerationFailure).not.toHaveBeenCalled();
      expect(dbUsage.recordUsage).not.toHaveBeenCalled();
    });

    it('should mark plan as failed and record usage for non-retryable failures', async () => {
      const service = new PersistenceService();

      vi.mocked(jobQueue.failJob).mockResolvedValue(null);
      vi.mocked(stripeUsage.markPlanGenerationFailure).mockResolvedValue(
        undefined
      );
      vi.mocked(dbUsage.recordUsage).mockResolvedValue(undefined);

      await service.failJob({
        jobId: 'job-123',
        planId: 'plan-123',
        userId: 'user-123',
        error: 'Validation failed',
        retryable: false,
        metadata: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          usage: {
            promptTokens: 50,
            completionTokens: 0,
          },
        },
      });

      expect(jobQueue.failJob).toHaveBeenCalledWith(
        'job-123',
        'Validation failed',
        { retryable: false }
      );

      expect(stripeUsage.markPlanGenerationFailure).toHaveBeenCalledWith(
        'plan-123'
      );

      expect(dbUsage.recordUsage).toHaveBeenCalledWith({
        userId: 'user-123',
        provider: 'openai',
        model: 'gpt-4o-mini',
        inputTokens: 50,
        outputTokens: 0,
        costCents: 0,
        kind: 'plan',
      });
    });

    it('should handle missing planId gracefully for non-retryable failures', async () => {
      const service = new PersistenceService();

      vi.mocked(jobQueue.failJob).mockResolvedValue(null);

      await service.failJob({
        jobId: 'job-123',
        planId: null,
        userId: 'user-123',
        error: 'Validation failed',
        retryable: false,
      });

      expect(jobQueue.failJob).toHaveBeenCalledWith(
        'job-123',
        'Validation failed',
        { retryable: false }
      );

      // Should not attempt to mark plan failed or record usage without planId
      expect(stripeUsage.markPlanGenerationFailure).not.toHaveBeenCalled();
      expect(dbUsage.recordUsage).not.toHaveBeenCalled();
    });
  });
});
