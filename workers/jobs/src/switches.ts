import type { WorkerEnv } from './env';

import { resolveModuleLessonGenerationEnabled } from '@/features/lesson-content/generation-flag';
import {
  jobRetentionCleanup,
  jobsPaused,
  parallelDirectResearch,
} from '@/flags';
import { parallelEnv } from '@/lib/config/env/ai';

/** One read of Flagship `jobs-paused`; `unknown` when the read failed. */
export type JobsPausedState = 'paused' | 'running' | 'unknown';

export async function readJobsPaused(): Promise<JobsPausedState> {
  try {
    return (await jobsPaused()) ? 'paused' : 'running';
  } catch {
    return 'unknown';
  }
}

/**
 * Flagship `jobs-paused` pauses every job (design note, Decision 7). A failed
 * read fails open to "not paused": a Flagship outage must not stop plan
 * generation, and `maintenance-mode` still stops the app sending new work.
 */
export async function isJobsPaused(): Promise<boolean> {
  return (await readJobsPaused()) === 'paused';
}

/** Whether the nightly retention cleanup runs, and why not when it skips. */
export type RetentionCleanupGate =
  | 'run'
  | 'paused'
  | 'disabled'
  | 'flag_unavailable';

/**
 * Retention cleanup deletes data, so it keeps its own flag,
 * `job-retention-cleanup` (default on), and fails closed: a failed read of
 * either flag skips one nightly run. `paused` is the tick's one
 * `jobs-paused` read.
 */
export async function retentionCleanupGate(
  paused: JobsPausedState,
): Promise<RetentionCleanupGate> {
  if (paused === 'unknown') {
    return 'flag_unavailable';
  }
  if (paused === 'paused') {
    return 'paused';
  }
  try {
    return (await jobRetentionCleanup()) ? 'run' : 'disabled';
  } catch {
    return 'flag_unavailable';
  }
}

/**
 * Worker email delivery (scheduled runs, the manual command, every page)
 * runs only in production and while not paused. Staging email is off by
 * design; the `EMAIL_TEST_RECIPIENT_ALLOWLIST` guard in the email Workflow
 * stays as defense in depth in case this check is ever widened. It does not
 * read `email-notification-delivery`: that flag gates the app's manual
 * trigger route, and it is off in production while scheduled email sends.
 */
export async function isEmailDeliveryEnabled(
  workerEnv: WorkerEnv['WORKER_ENV'],
): Promise<boolean> {
  return workerEnv === 'production' && !(await isJobsPaused());
}

/** Module lessons run only while not paused and `module-lesson-generation` is on. */
export async function isModuleLessonsEnabled(): Promise<boolean> {
  const [paused, enabled] = await Promise.all([
    isJobsPaused(),
    resolveModuleLessonGenerationEnabled(),
  ]);
  return !paused && enabled;
}

/**
 * Plan research searches Parallel directly instead of using OpenRouter's
 * `web_search` tool (DEV-171) only when Flagship `parallel-direct-research`
 * is on and `PARALLEL_API_KEY` is set. Without the key the flag stays off, so
 * flipping it before the key is synced keeps research working. Fails closed.
 */
export async function isDirectResearchEnabled(): Promise<boolean> {
  if (!parallelEnv.apiKey) {
    return false;
  }
  try {
    return await parallelDirectResearch();
  } catch {
    return false;
  }
}
