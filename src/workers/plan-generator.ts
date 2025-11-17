import { appEnv } from '@/lib/config/env';
import { client } from '@/lib/db/drizzle';
import { logger } from '@/lib/logging/logger';
import { getNextJob } from '@/lib/jobs/queue';
import { JOB_TYPES, type Job, type JobType } from '@/lib/jobs/types';
import type { ProcessPlanGenerationJobResult } from './handlers/plan-generation-handler';
import { normalizeError, sleep } from './utils';

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30_000;

const ACTIVE_JOB_TYPES = [
  JOB_TYPES.PLAN_GENERATION,
  JOB_TYPES.PLAN_REGENERATION,
] as const;

export interface JobHandler {
  processJob(
    job: Job,
    opts?: { signal?: AbortSignal }
  ): Promise<ProcessPlanGenerationJobResult>;
}

export interface PlanGenerationWorkerOptions {
  pollIntervalMs?: number;
  concurrency?: number;
  gracefulShutdownTimeoutMs?: number;
  closeDbOnStop?: boolean;
  handlers: Record<JobType, JobHandler>;
}

export interface PlanGenerationWorkerStats {
  polls: number;
  idlePolls: number;
  jobsStarted: number;
  jobsCompleted: number;
  jobsFailed: number;
  [key: string]: unknown;
}

export class PlanGenerationWorker {
  private readonly pollIntervalMs: number;
  private readonly concurrency: number;
  private readonly gracefulShutdownTimeoutMs: number;
  private readonly closeDbOnStop: boolean;
  private readonly handlers: Record<JobType, JobHandler>;

  private isRunning = false;
  private stopRequested = false;
  private loopPromise: Promise<void> | null = null;
  private shuttingDown = false;
  private shutdownController: AbortController | null = null;

  private readonly activeJobs = new Set<Promise<void>>();
  private readonly stats: PlanGenerationWorkerStats = {
    polls: 0,
    idlePolls: 0,
    jobsStarted: 0,
    jobsCompleted: 0,
    jobsFailed: 0,
  };

  constructor(options: PlanGenerationWorkerOptions) {
    this.pollIntervalMs = Math.max(
      options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      10
    );
    this.concurrency = Math.max(options.concurrency ?? DEFAULT_CONCURRENCY, 1);
    const isTest = appEnv.isTest;
    this.gracefulShutdownTimeoutMs = Math.max(
      options.gracefulShutdownTimeoutMs ??
        (isTest ? 60_000 : DEFAULT_SHUTDOWN_TIMEOUT_MS),
      1000
    );
    this.closeDbOnStop = options.closeDbOnStop ?? true;
    this.handlers = options.handlers;
  }

  getStats(): PlanGenerationWorkerStats {
    return { ...this.stats };
  }

  start(): void {
    if (this.isRunning) {
      this.log('warn', 'worker_already_running', {
        pollIntervalMs: this.pollIntervalMs,
        concurrency: this.concurrency,
      });
      return;
    }

    this.log('info', 'worker_start', {
      pollIntervalMs: this.pollIntervalMs,
      concurrency: this.concurrency,
    });

    this.isRunning = true;
    this.stopRequested = false;
    this.shutdownController = new AbortController();

    this.loopPromise = this.runLoop().finally(() => {
      this.isRunning = false;
      this.loopPromise = null;
      this.log('info', 'worker_stopped', this.getStats());
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning || this.shuttingDown) {
      return;
    }

    this.shuttingDown = true;
    this.stopRequested = true;
    this.log('info', 'worker_stop_requested', {});

    // Abort in-flight work to prevent hanging
    this.shutdownController?.abort();

    const loop = this.loopPromise;
    if (!loop) {
      if (this.closeDbOnStop) {
        await this.closeDatabaseConnection();
      }
      this.shuttingDown = false;
      return;
    }

    let timeoutId: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<void>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Worker shutdown timeout exceeded'));
      }, this.gracefulShutdownTimeoutMs);
    });

    try {
      await Promise.race([loop, timeoutPromise]);
    } catch (error) {
      const details = normalizeError(error);
      this.log('error', 'worker_stop_timeout', {
        ...details,
        activeJobsCount: this.activeJobs.size,
      });
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    if (this.closeDbOnStop) {
      await this.closeDatabaseConnection();
    }
    this.shuttingDown = false;
  }

  // Cache cleanup removed – no-op

  private async runLoop(): Promise<void> {
    try {
      while (!this.stopRequested) {
        if (this.activeJobs.size >= this.concurrency) {
          await Promise.race(this.activeJobs);
          continue;
        }

        this.stats.polls += 1;
        const job = await getNextJob([...ACTIVE_JOB_TYPES]);

        if (!job) {
          this.stats.idlePolls += 1;
          await sleep(this.pollIntervalMs);
          continue;
        }

        this.dispatchJob(job);
      }
    } finally {
      await Promise.allSettled(Array.from(this.activeJobs));
      this.activeJobs.clear();
    }
  }

  private dispatchJob(job: Job): void {
    this.stats.jobsStarted += 1;
    const jobPromise = this.handleJob(job).catch((error) => {
      const details = normalizeError(error);
      this.log('error', 'job_unhandled_error', {
        jobId: job.id,
        planId: job.planId,
        message: details.message,
        name: details.name ?? null,
      });
    });

    this.activeJobs.add(jobPromise);
    void jobPromise.finally(() => {
      this.activeJobs.delete(jobPromise);
    });
  }

  private async handleJob(job: Job): Promise<void> {
    const startedAt = Date.now();
    this.log('info', 'job_started', {
      jobId: job.id,
      jobType: job.type,
      planId: job.planId,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
    });

    try {
      const handler = this.handlers[job.type];
      if (!handler) {
        this.log('error', 'unsupported_job_type', {
          jobId: job.id,
          jobType: job.type,
        });
        this.stats.jobsFailed += 1;
        return;
      }

      const signal = this.shutdownController?.signal;
      const result = await handler.processJob(job, { signal });
      this.finalizeJob(job, result, Date.now() - startedAt);
    } catch (error) {
      const normalized = normalizeError(error);
      this.log('error', 'job_processing_error', {
        jobId: job.id,
        jobType: job.type,
        planId: job.planId,
        message: normalized.message,
        name: normalized.name ?? null,
      });

      this.stats.jobsFailed += 1;
    }
  }

  private finalizeJob(
    job: Job,
    result: ProcessPlanGenerationJobResult,
    durationMs: number
  ): void {
    if (result.status === 'success') {
      this.stats.jobsCompleted += 1;
      this.log('info', 'job_completed', {
        jobId: job.id,
        planId: job.planId,
        durationMs,
        modulesCount: result.result.modulesCount,
        tasksCount: result.result.tasksCount,
      });
      return;
    }

    this.stats.jobsFailed += 1;
    this.log(result.retryable ? 'warn' : 'error', 'job_failed', {
      jobId: job.id,
      planId: job.planId,
      classification: result.classification,
      retryable: result.retryable,
      durationMs,
    });
  }

  private async closeDatabaseConnection(): Promise<void> {
    try {
      await client.end({ timeout: 5 });
      this.log('info', 'worker_db_connection_closed', {});
    } catch (error) {
      const details = normalizeError(error);
      this.log('warn', 'worker_db_connection_close_error', details);
    }
  }

  private log(
    level: 'info' | 'warn' | 'error',
    event: string,
    payload: Record<string, unknown>
  ): void {
    const entry = {
      source: 'plan-generation-worker',
      level,
      event,
      timestamp: new Date().toISOString(),
      ...payload,
    } satisfies Record<string, unknown>;

    if (level === 'error') {
      logger.error(entry, event);
    } else if (level === 'warn') {
      logger.warn(entry, event);
    } else {
      logger.info(entry, event);
    }
  }
}
