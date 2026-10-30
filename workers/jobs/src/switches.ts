import type { WorkerEnv } from './env';

import { resolveModuleLessonGenerationEnabled } from '@/features/lesson-content/generation-flag';
import {
  jobRetentionCleanup,
  jobsPaused,
  parallelDirectResearch,
} from '@/flags';
import { parallelEnv } from '@/lib/config/env/ai';

/**
 * Flagship `jobs-paused` pauses every job (design note, Decision 7). A failed
 * read fails open to "not paused": a Flagship outage must not stop plan
 * generation, and `maintenance-mode` still stops the app sending new work.
 */
export async function isJobsPaused(): Promise<boolean> {
  try {
    return await jobsPaused();
  } catch {
    return false;
  }
}

/**
 * Retention cleanup deletes data, so it keeps its own flag,
 * `job-retention-cleanup` (default on). Fails closed: a failed read skips one
 * nightly run.
 */
export async function isRetentionCleanupEnabled(): Promise<boolean> {
  if (await isJobsPaused()) {
    return false;
  }
  try {
    return await jobRetentionCleanup();
  } catch {
    return false;
  }
}

/**
 * Worker email delivery (scheduled runs, the manual command, every page)
 * runs only in production and while not paused. It does not read
 * `email-notification-delivery`: that flag gates the app's manual trigger
 * route, and it is off in production while scheduled email sends.
 */
export async function isEmailDeliveryEnabled(
  workerEnv: WorkerEnv['WORKER_ENV'],
): Promise<boolean> {
  return workerEnv === 'production' && !(await isJobsPaused());
}

/** Module lessons run only while not paused and `module-lesson-generation` is on. */
export async function isModuleLessonsEnabled(): Promise<boolean> {
  return (
    !(await isJobsPaused()) && (await resolveModuleLessonGenerationEnabled())
  );
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
