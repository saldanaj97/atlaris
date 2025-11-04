import 'dotenv/config';

import { client } from '@/lib/db/drizzle';
import {
  completeJob,
  failJob,
  getNextJob,
  type FailJobOptions,
} from '@/lib/jobs/queue';
import { processPlanRegenerationJob } from '@/lib/jobs/worker-service';
import { JOB_TYPES } from '@/lib/jobs/types';

const DEFAULT_POLL_INTERVAL_MS = 2000;

const ACTIVE_JOB_TYPES = [JOB_TYPES.PLAN_REGENERATION] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeError(error: unknown): { message: string; name?: string } {
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }

  if (typeof error === 'string' && error.length) {
    return { message: error };
  }

  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: 'Unknown error' };
  }
}

async function main() {
  const shutdown = new AbortController();
  process.on('SIGINT', () => shutdown.abort());
  process.on('SIGTERM', () => shutdown.abort());

  console.info(
    JSON.stringify({
      source: 'plan-regeneration-worker',
      level: 'info',
      event: 'worker_start',
      pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    })
  );

  while (!shutdown.signal.aborted) {
    try {
      const job = await getNextJob([...ACTIVE_JOB_TYPES]);

      if (!job) {
        await sleep(DEFAULT_POLL_INTERVAL_MS);
        continue;
      }

      const startedAt = Date.now();
      console.info(
        JSON.stringify({
          source: 'plan-regeneration-worker',
          level: 'info',
          event: 'job_started',
          jobId: job.id,
          planId: job.planId,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
        })
      );

      try {
        const result = await processPlanRegenerationJob(job, {
          signal: shutdown.signal,
        });

        if (result.status === 'success') {
          await completeJob(job.id, result.result);
          const durationMs = Date.now() - startedAt;
          console.info(
            JSON.stringify({
              source: 'plan-regeneration-worker',
              level: 'info',
              event: 'job_completed',
              jobId: job.id,
              planId: job.planId,
              durationMs,
              modulesCount: result.result.modulesCount,
              tasksCount: result.result.tasksCount,
            })
          );
        } else {
          const failOptions: FailJobOptions | undefined = result.retryable
            ? undefined
            : { retryable: false };

          await failJob(job.id, result.error, failOptions);
          const durationMs = Date.now() - startedAt;
          console.log(
            JSON.stringify({
              source: 'plan-regeneration-worker',
              level: result.retryable ? 'warn' : 'error',
              event: 'job_failed',
              jobId: job.id,
              planId: job.planId,
              classification: result.classification,
              retryable: result.retryable,
              durationMs,
            })
          );
        }
      } catch (error) {
        const normalized = normalizeError(error);
        console.error(
          JSON.stringify({
            source: 'plan-regeneration-worker',
            level: 'error',
            event: 'job_processing_error',
            jobId: job.id,
            planId: job.planId,
            message: normalized.message,
            name: normalized.name ?? null,
          })
        );

        try {
          await failJob(job.id, normalized.message);
        } catch (failError) {
          const fallback = normalizeError(failError);
          console.error(
            JSON.stringify({
              source: 'plan-regeneration-worker',
              level: 'error',
              event: 'job_fail_fallback_error',
              jobId: job.id,
              planId: job.planId,
              message: fallback.message,
            })
          );
        }
      }
    } catch (error) {
      const normalized = normalizeError(error);
      console.error(
        JSON.stringify({
          source: 'plan-regeneration-worker',
          level: 'error',
          event: 'worker_loop_error',
          message: normalized.message,
        })
      );
      await sleep(DEFAULT_POLL_INTERVAL_MS);
    }
  }

  console.info(
    JSON.stringify({
      source: 'plan-regeneration-worker',
      level: 'info',
      event: 'worker_stopped',
    })
  );

  await client.end({ timeout: 5 });
}

void main();
