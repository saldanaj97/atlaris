import type { JobSwitchVars } from '../env';
import type { ModuleLessonsWorkflowParams } from '../workflows/module-lessons/run';
import type {
  CaptureException,
  RegenerationQueueMessage,
} from './regeneration-shared';
import type {
  RegenerationRunContext,
  RegenerationRunResult,
  runPlanRegeneration,
  terminalizeAbandonedRegenerationRun,
} from '@/features/jobs/regeneration-run';
import type { DbClient } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';

import { moduleLessonsInstanceId } from '../workflows/module-lessons/instance-id';
import {
  readRegenerationSwitch,
  REGENERATION_JOB_TAG,
  REGENERATION_SENTRY_TAGS,
} from './regeneration-shared';
import { startModuleLessonGeneration } from '@/features/lesson-content/start-module-lesson-generation-workflow';
import { regenerationEnqueueCommandSchema } from '@/lib/jobs-worker/contract';

/** Request these in wrangler.jsonc; the consumer relies on `max_retries`. */
export const REGENERATION_QUEUE_CONSUMER_SETTINGS = {
  max_batch_size: 1,
  max_batch_timeout: 0,
  max_retries: 3,
  max_concurrency: 2,
} as const;

/** Paused or disabled: hold messages for 15 minutes (Decision 7). */
export const REGENERATION_PAUSED_RETRY_DELAY_SECONDS = 900;
/** Backoff after an unexpected error; the redelivery resumes the same run. */
export const REGENERATION_ERROR_RETRY_DELAY_SECONDS = 60;
/** Queues delay messages by at most 24 hours. */
const MAX_QUEUE_DELAY_SECONDS = 86_400;

export type RegenerationConsumerDeps = {
  readonly env: JobSwitchVars;
  readonly logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  readonly captureException: CaptureException;
  /** Runs `fn` with this invocation's database client in scope. */
  readonly withDb: <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;
  readonly run: typeof runPlanRegeneration;
  readonly terminalize: typeof terminalizeAbandonedRegenerationRun;
  readonly startModuleLessons: RegenerationRunContext['startModuleLessons'];
  readonly now?: () => number;
};

/**
 * Starts module lessons from regeneration finalization: the same flag check,
 * preflight, and provisional claim as `startModuleLessonGeneration`, then
 * `MODULE_LESSONS_WORKFLOW.create` directly (no HTTP hop). A thrown create
 * reverts the provisional claim, as a failed Vercel start does.
 */
export function createWorkflowModuleLessonStarter(deps: {
  readonly workflow: Pick<Workflow<ModuleLessonsWorkflowParams>, 'create'>;
  /** `isJobEnabled(env, 'MODULE_LESSONS')`. */
  readonly isEnabled: () => boolean;
}): RegenerationRunContext['startModuleLessons'] {
  return (params) =>
    startModuleLessonGeneration(params, {
      dbClient: params.dbClient,
      isGenerationEnabled: deps.isEnabled,
      // 'vercel' means "use the injected workflowStart", never an HTTP hop to this Worker.
      runtime: () => 'vercel',
      workflowStart: async (_vercelWorkflow, [input]) => {
        // The start helper claims with `batchRequestId = correlationId`.
        const command: ModuleLessonsWorkflowParams = {
          v: 1,
          planId: input.planId,
          moduleId: input.moduleId,
          userId: input.userId,
          batchRequestId: input.correlationId,
          correlationId: input.correlationId,
          ...(input.modelOverride
            ? { modelOverride: input.modelOverride }
            : {}),
        };
        const id = await moduleLessonsInstanceId(
          command.moduleId,
          command.batchRequestId,
        );
        await deps.workflow.create({ id, params: command });
        return { runId: id, returnValue: Promise.resolve() };
      },
    });
}

function delayUntil(scheduledFor: Date, nowMs: number): number {
  const seconds = Math.ceil((scheduledFor.getTime() - nowMs) / 1000);
  return Math.min(Math.max(seconds, 0), MAX_QUEUE_DELAY_SECONDS);
}

async function consumeMessage(
  message: Message<RegenerationQueueMessage>,
  deps: RegenerationConsumerDeps,
): Promise<void> {
  const now = deps.now ?? Date.now;
  const parsed = regenerationEnqueueCommandSchema.safeParse(message.body);
  if (!parsed.success) {
    deps.logger.error(
      { job: REGENERATION_JOB_TAG, messageId: message.id },
      'Dropping regeneration message with an invalid body',
    );
    message.ack();
    return;
  }

  const { jobId } = parsed.data;
  const runId = message.id;
  const startedAtMs = now();
  const logContext = {
    job: REGENERATION_JOB_TAG,
    jobId,
    runId,
    deliveryAttempt: message.attempts,
  };

  let result: RegenerationRunResult;
  try {
    result = await deps.withDb(() =>
      deps.run(jobId, { runId, startModuleLessons: deps.startModuleLessons }),
    );
  } catch (error) {
    deps.captureException(error, {
      tags: REGENERATION_SENTRY_TAGS,
      extra: { jobId, runId, deliveryAttempt: message.attempts },
    });
    const lastDelivery =
      message.attempts > REGENERATION_QUEUE_CONSUMER_SETTINGS.max_retries;
    if (!lastDelivery) {
      deps.logger.warn(
        { ...logContext, wallMs: now() - startedAtMs },
        'Regeneration run failed unexpectedly; message will be redelivered',
      );
      message.retry({ delaySeconds: REGENERATION_ERROR_RETRY_DELAY_SECONDS });
      return;
    }

    let terminalized = false;
    try {
      terminalized = await deps.withDb(() => deps.terminalize(jobId, runId));
    } catch (terminalizeError) {
      deps.captureException(terminalizeError, {
        tags: REGENERATION_SENTRY_TAGS,
        extra: { jobId, runId, phase: 'terminalize' },
      });
    }
    deps.logger.error(
      { ...logContext, terminalized, wallMs: now() - startedAtMs },
      'Regeneration run failed on its last delivery',
    );
    message.ack();
    return;
  }

  // Workers Logs records CPU time per invocation; wall time here lets staging
  // line consumer runs up with those numbers (Decision 9).
  const wallMs = now() - startedAtMs;
  if (result.kind === 'retry-scheduled') {
    const delaySeconds = delayUntil(result.scheduledFor, now());
    deps.logger.info(
      { ...logContext, outcome: result.kind, delaySeconds, wallMs },
      'Regeneration run scheduled a retry',
    );
    message.retry({ delaySeconds });
    return;
  }

  deps.logger.info(
    { ...logContext, outcome: result.kind, wallMs },
    'Regeneration run finished',
  );
  message.ack();
}

/**
 * Queue consumer for `atlaris-regeneration-<env>`. Each message runs one
 * `job_queue` regeneration inline: claim (CAS) → reserve → process → finalize.
 */
export async function handleRegenerationBatch(
  batch: MessageBatch<RegenerationQueueMessage>,
  deps: RegenerationConsumerDeps,
): Promise<void> {
  const switchState = readRegenerationSwitch(deps.env);
  if (switchState !== 'enabled') {
    deps.logger.info(
      {
        job: REGENERATION_JOB_TAG,
        switchState,
        messages: batch.messages.length,
      },
      'Regeneration consumer is off; holding messages',
    );
    batch.retryAll({ delaySeconds: REGENERATION_PAUSED_RETRY_DELAY_SECONDS });
    return;
  }

  for (const message of batch.messages) {
    await consumeMessage(message, deps);
  }
}
