import type { RegenerationQueueMessage } from './jobs/regeneration-shared';
import type { DbClient } from '@/lib/db/types';

import { withInvocationDb } from './db';
import { parseWorkerEnv, type WorkerEnv } from './env';
import {
  EMAIL_DELIVERY_RUNS_PATH,
  handleEmailDeliveryRunsCommand,
} from './http/email-delivery-runs';
import { handleModuleLessonsStart } from './http/module-lessons-start';
import { handleFetch } from './http/router';
import { unauthorizedResponse, verifySignedRequest } from './http/signature';
import { HEARTBEAT_CRON, runHeartbeat } from './jobs/heartbeat';
import { runPlanCleanup } from './jobs/plan-cleanup';
import {
  createWorkflowModuleLessonStarter,
  handleRegenerationBatch,
} from './jobs/regeneration-consumer';
import { handleRegenerationEnqueue } from './jobs/regeneration-enqueue';
import { runRegenerationSweep } from './jobs/regeneration-sweep';
import {
  RETENTION_CLEANUP_CRON,
  runRetentionCleanup,
} from './jobs/retention-cleanup';
import { isJobEnabled, isJobsPaused } from './switches';
import { EmailDeliveryWorkflowEntrypoint } from './workflows/email-delivery';
import { ModuleLessonsWorkflowEntrypoint } from './workflows/module-lessons';
import {
  runPlanRegeneration,
  terminalizeAbandonedRegenerationRun,
} from '@/features/jobs/regeneration-run';
import { JOBS_COMMAND_PATHS } from '@/lib/jobs-worker/contract';
import { createLogger } from '@/lib/logging/logger';
import { beforeSendSentryEvent } from '@/lib/observability/sentry-filters';
import * as Sentry from '@sentry/cloudflare';

const logger = createLogger({ runtime: 'cloudflare-worker' });

type WithDb = <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;

/** Runs every job, then rethrows the first failure so the invocation fails. */
async function runIndependently(jobs: Array<() => Promise<unknown>>) {
  const results = await Promise.allSettled(jobs.map((job) => job()));
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) {
    throw failed.reason;
  }
}

const sentryOptions = (env: WorkerEnv) => ({
  // Empty until B1 supplies the atlaris-jobs DSN; Sentry stays disabled.
  dsn: env.SENTRY_DSN || undefined,
  environment: env.WORKER_ENV,
  // Workers Builds deploys with --var SENTRY_RELEASE:<commit SHA>.
  release: env.SENTRY_RELEASE ?? env.CF_VERSION_METADATA.id,
  sendDefaultPii: false,
  beforeSend: beforeSendSentryEvent,
  initialScope: { tags: { runtime: 'cloudflare-worker' } },
});

export const EmailDeliveryWorkflow = Sentry.instrumentWorkflowWithSentry(
  sentryOptions,
  EmailDeliveryWorkflowEntrypoint,
);

export const ModuleLessonsWorkflow = Sentry.instrumentWorkflowWithSentry(
  sentryOptions,
  ModuleLessonsWorkflowEntrypoint,
);

export default Sentry.withSentry<WorkerEnv>(sentryOptions, {
  async fetch(request, env, ctx) {
    const workerEnv = parseWorkerEnv(env);
    const { pathname } = new URL(request.url);

    if (
      request.method === 'POST' &&
      pathname === JOBS_COMMAND_PATHS.regenerationEnqueue
    ) {
      return handleRegenerationEnqueue(request, {
        env: workerEnv,
        queue: workerEnv.REGENERATION_QUEUE,
        logger,
        captureException: Sentry.captureException,
      });
    }

    if (
      request.method === 'POST' &&
      pathname === JOBS_COMMAND_PATHS.moduleLessonsStart
    ) {
      return handleModuleLessonsStart(request, {
        env: workerEnv,
        workflow: workerEnv.MODULE_LESSONS_WORKFLOW,
        logger,
      });
    }

    if (request.method === 'POST' && pathname === EMAIL_DELIVERY_RUNS_PATH) {
      const verification = await verifySignedRequest(request, workerEnv);
      if (!verification.ok) {
        return unauthorizedResponse();
      }
      // The verifier consumed the body; hand the handler the signed bytes.
      const verified = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: verification.body,
      });
      return handleEmailDeliveryRunsCommand(verified, {
        switches: workerEnv,
        withDb: (fn) => withInvocationDb(workerEnv.HYPERDRIVE, ctx, fn),
        workflow: workerEnv.EMAIL_DELIVERY_WORKFLOW,
        logger,
      });
    }

    return handleFetch(request, workerEnv);
  },

  async scheduled(controller, env, ctx) {
    const workerEnv = parseWorkerEnv(env);
    const withDb: WithDb = (fn) =>
      withInvocationDb(workerEnv.HYPERDRIVE, ctx, fn);

    switch (controller.cron) {
      // Every */15 job runs independently; one failure does not skip the others.
      case HEARTBEAT_CRON:
        await runIndependently([
          () =>
            runHeartbeat({
              paused: isJobsPaused(workerEnv),
              logger,
              withDb,
              withMonitor: Sentry.withMonitor,
            }),
          () =>
            runPlanCleanup({
              enabled: isJobEnabled(workerEnv, 'PLAN_CLEANUP'),
              logger,
              withDb,
              captureException: Sentry.captureException,
            }),
          () =>
            runRegenerationSweep({
              env: workerEnv,
              logger,
              captureException: Sentry.captureException,
              withDb,
              queue: workerEnv.REGENERATION_QUEUE,
            }),
        ]);
        return;
      case RETENTION_CLEANUP_CRON:
        await runRetentionCleanup({
          enabled: isJobEnabled(workerEnv, 'RETENTION_CLEANUP'),
          logger,
          withDb,
          captureException: Sentry.captureException,
        });
        return;
      default:
        logger.warn({ cron: controller.cron }, 'No job for this cron');
    }
  },

  async queue(batch, env, ctx) {
    const workerEnv = parseWorkerEnv(env);

    await handleRegenerationBatch(
      batch as MessageBatch<RegenerationQueueMessage>,
      {
        env: workerEnv,
        logger,
        captureException: Sentry.captureException,
        withDb: (fn) => withInvocationDb(workerEnv.HYPERDRIVE, ctx, fn),
        run: runPlanRegeneration,
        terminalize: terminalizeAbandonedRegenerationRun,
        startModuleLessons: createWorkflowModuleLessonStarter({
          workflow: workerEnv.MODULE_LESSONS_WORKFLOW,
          isEnabled: () => isJobEnabled(workerEnv, 'MODULE_LESSONS'),
        }),
      },
    );
  },
} satisfies ExportedHandler<WorkerEnv>);
