import 'donv/config';

import { client, isClientInitialized } from '@/lib/db/service-role';
import {
  completeJob,
  failJob,
  getNextJob,
  type FailJobOptions,
} from '@/lib/jobs/queue';
import { JOB_TYPES } from '@/lib/jobs/types';
import { processPlanRegenerationJob } from '@/lib/jobs/worker-service';
import { logger } from '@/lib/logging/logger';
import { normalizeError, sleep } from './utils';

const DEFAULT_POLL_INTERVAL_MS = 2000;

const ACTIVE_JOB_TYPES = [JOB_TYPES.PLAN_REGENERATION] as const;

async function main() {
  const shutdown = new AbortController();
  process.on('SIGINT', () => shutdown.abort());
  process.on('SIGTERM', () => shutdown.abort());

  logger.info(
    {
      source: 'plan-regeneration-worker',
      event: 'worker_start',
      pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    },
    'Plan regeneration worker started'
  );

  while (!shutdown.signal.aborted) {
    try {
      const job = await getNextJob([...ACTIVE_JOB_TYPES]);

      if (!job) {
        await sleep(DEFAULT_POLL_INTERVAL_MS);
        continue;
      }

      const startedAt = Date.now();
      logger.info(
        {
          source: 'plan-regeneration-worker',
          event: 'job_started',
          jobId: job.id,
          planId: job.planId,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
        },
        'Plan regeneration job started'
      );

      try {
        const result = await processPlanRegenerationJob(job, {
          signal: shutdown.signal,
        });

        if (result.status === 'success') {
          await completeJob(job.id, result.result);
          const durationMs = Date.now() - startedAt;
          logger.info(
            {
              source: 'plan-regeneration-worker',
              event: 'job_completed',
              jobId: job.id,
              planId: job.planId,
              durationMs,
              modulesCount: result.result.modulesCount,
              tasksCount: result.result.tasksCount,
            },
            'Plan regeneration job completed'
          );
        } else {
          const failOptions: FailJobOptions | undefined = result.retryable
            ? undefined
            : { retryable: false };

          await failJob(job.id, result.error, failOptions);
          const durationMs = Date.now() - startedAt;
          const logPayload = {
            source: 'plan-regeneration-worker',
            event: 'job_failed',
            jobId: job.id,
            planId: job.planId,
            classification: result.classification,
            retryable: result.retryable,
            durationMs,
          };
          if (result.retryable) {
            logger.warn(logPayload, 'Plan regeneration job failed (retryable)');
          } else {
            logger.error(logPayload, 'Plan regeneration job failed');
          }
        }
      } catch (error) {
        const normalized = normalizeError(error);
        logger.error(
          {
            source: 'plan-regeneration-worker',
            event: 'job_processing_error',
            jobId: job.id,
            planId: job.planId,
            message: normalized.message,
            name: normalized.name ?? null,
          },
          'Plan regeneration job processing error'
        );

        try {
          await failJob(job.id, normalized.message);
        } catch (failError) {
          const fallback = normalizeError(failError);
          logger.error(
            {
              source: 'plan-regeneration-worker',
              event: 'job_fail_fallback_error',
              jobId: job.id,
              planId: job.planId,
              message: fallback.message,
            },
            'Plan regeneration fail fallback error'
          );
        }
      }
    } catch (error) {
      // TODO: Look into why this is failing in a loop
      const normalized = normalizeError(error);
      logger.error(
        {
          source: 'plan-regeneration-worker',
          event: 'worker_loop_error',
          message: normalized.message,
        },
        'Plan regeneration loop error'
      );
      await sleep(DEFAULT_POLL_INTERVAL_MS);
    }
  }

  logger.info(
    {
      source: 'plan-regeneration-worker',
      event: 'worker_stopped',
    },
    'Plan regeneration worker stopped'
  );

  if (isClientInitialized()) {
    await client.end({ timeout: 5 });
  }
}

void main();
