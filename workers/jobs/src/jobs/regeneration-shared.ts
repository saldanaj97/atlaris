import type { RegenerationEnqueueCommand } from '@/lib/jobs-worker/contract';

/** Body of every message on `atlaris-regeneration-<env>`. */
export type RegenerationQueueMessage = RegenerationEnqueueCommand;

export type RegenerationQueue = Pick<
  Queue<RegenerationQueueMessage>,
  'send' | 'sendBatch'
>;

export const REGENERATION_JOB_TAG = 'regeneration';

/** Sentry tags for every regeneration failure report (binding rules). */
export const REGENERATION_SENTRY_TAGS = {
  job: REGENERATION_JOB_TAG,
  runtime: 'cloudflare-worker',
} as const;

export type CaptureException = (
  error: unknown,
  context: {
    tags: typeof REGENERATION_SENTRY_TAGS;
    extra?: Record<string, unknown>;
  },
) => unknown;
