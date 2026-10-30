import type { RegenerationQueueMessage } from './jobs/regeneration-shared';
import type { DbClient } from '@/lib/db/types';

import { withInvocationDb } from './db';
import { parseWorkerEnv, type WorkerEnv } from './env';
import { registerWorkerFlags } from './flags';
import {
  EMAIL_DELIVERY_RUNS_PATH,
  handleEmailDeliveryRunsCommand,
} from './http/email-delivery-runs';
import { handleModuleLessonsStart } from './http/module-lessons-start';
import { handlePlanGenerationStart } from './http/plan-generation-start';
import { handleFetch } from './http/router';
import { unauthorizedResponse, verifySignedRequest } from './http/signature';
import { runHeartbeat } from './jobs/heartbeat';
import { runPlanCleanup } from './jobs/plan-cleanup';
import { runPostHogDeletion } from './jobs/posthog-deletion';
import {
  createWorkflowModuleLessonStarter,
  handleRegenerationBatch,
} from './jobs/regeneration-consumer';
import { handleRegenerationEnqueue } from './jobs/regeneration-enqueue';
import { createGroundedRegenerationStages } from './jobs/regeneration-grounded';
import { runRegenerationSweep } from './jobs/regeneration-sweep';
import { runRetentionCleanup } from './jobs/retention-cleanup';
import { runScheduledJobs } from './scheduled';
import {
  isDirectResearchEnabled,
  isEmailDeliveryEnabled,
  isJobsPaused,
  isModuleLessonsEnabled,
  readJobsPaused,
  retentionCleanupGate,
} from './switches';
import { EmailDeliveryWorkflowEntrypoint } from './workflows/email-delivery';
import { ModuleLessonsWorkflowEntrypoint } from './workflows/module-lessons';
import { PlanGenerationWorkflowEntrypoint } from './workflows/plan-generation';
import {
  runPlanRegeneration,
  terminalizeAbandonedRegenerationRun,
} from '@/features/jobs/regeneration-run';
import { resolveModuleLessonGenerationEnabled } from '@/features/lesson-content/generation-flag';
import { JOBS_COMMAND_PATHS } from '@/lib/jobs-worker/contract';
import { createLogger } from '@/lib/logging/logger';
import { beforeSendSentryEvent } from '@/lib/observability/sentry-filters';
import * as Sentry from '@sentry/cloudflare';

const logger = createLogger({ runtime: 'cloudflare-worker' });

type WithDb = <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;

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

export const PlanGenerationWorkflow = Sentry.instrumentWorkflowWithSentry(
  sentryOptions,
  PlanGenerationWorkflowEntrypoint,
);

export default Sentry.withSentry<WorkerEnv>(sentryOptions, {
  async fetch(request, env, ctx) {
    const workerEnv = parseWorkerEnv(env);
    registerWorkerFlags(workerEnv);
    const { pathname } = new URL(request.url);

    if (
      request.method === 'POST' &&
      pathname === JOBS_COMMAND_PATHS.regenerationEnqueue
    ) {
      return handleRegenerationEnqueue(request, {
        env: workerEnv,
        isPaused: isJobsPaused,
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
        isPaused: isJobsPaused,
        isGenerationEnabled: resolveModuleLessonGenerationEnabled,
        workflow: workerEnv.MODULE_LESSONS_WORKFLOW,
        logger,
      });
    }

    if (
      request.method === 'POST' &&
      pathname === JOBS_COMMAND_PATHS.planGenerationStart
    ) {
      return handlePlanGenerationStart(request, {
        env: workerEnv,
        isPaused: isJobsPaused,
        workflow: workerEnv.PLAN_GENERATION_WORKFLOW,
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
        isPaused: isJobsPaused,
        isDeliveryEnabled: () => isEmailDeliveryEnabled(workerEnv.WORKER_ENV),
        withDb: (fn) => withInvocationDb(workerEnv.HYPERDRIVE, ctx, fn),
        workflow: workerEnv.EMAIL_DELIVERY_WORKFLOW,
        logger,
      });
    }

    return handleFetch(request, workerEnv);
  },

  async scheduled(controller, env, ctx) {
    const workerEnv = parseWorkerEnv(env);
    registerWorkerFlags(workerEnv);
    const withDb: WithDb = (fn) =>
      withInvocationDb(workerEnv.HYPERDRIVE, ctx, fn);

    await runScheduledJobs(controller.cron, {
      workerEnv: workerEnv.WORKER_ENV,
      readJobsPaused,
      retentionCleanupGate,
      logger,
      jobs: {
        heartbeat: (paused) =>
          runHeartbeat({
            paused,
            logger,
            withDb,
            withMonitor: Sentry.withMonitor,
          }),
        planCleanup: (enabled) =>
          runPlanCleanup({
            enabled,
            logger,
            withDb,
            captureException: Sentry.captureException,
          }),
        regenerationSweep: (paused) =>
          runRegenerationSweep({
            paused,
            logger,
            captureException: Sentry.captureException,
            withDb,
            queue: workerEnv.REGENERATION_QUEUE,
          }),
        retentionCleanup: (gate) =>
          runRetentionCleanup({
            gate,
            logger,
            withDb,
            captureException: Sentry.captureException,
          }),
        postHogDeletion: (enabled) =>
          runPostHogDeletion({
            enabled,
            apiKey: workerEnv.POSTHOG_PERSONAL_API_KEY,
            logger,
            withDb,
            captureException: Sentry.captureException,
          }),
      },
    });
  },

  async queue(batch, env, ctx) {
    const workerEnv = parseWorkerEnv(env);
    registerWorkerFlags(workerEnv);

    await handleRegenerationBatch(
      batch as MessageBatch<RegenerationQueueMessage>,
      {
        isPaused: isJobsPaused,
        logger,
        captureException: Sentry.captureException,
        withDb: (fn) => withInvocationDb(workerEnv.HYPERDRIVE, ctx, fn),
        run: runPlanRegeneration,
        terminalize: terminalizeAbandonedRegenerationRun,
        startModuleLessons: createWorkflowModuleLessonStarter({
          workflow: workerEnv.MODULE_LESSONS_WORKFLOW,
          isEnabled: isModuleLessonsEnabled,
          logger,
        }),
        grounded: createGroundedRegenerationStages({
          isDirectResearchEnabled,
          logger,
        }),
      },
    );
  },
} satisfies ExportedHandler<WorkerEnv>);
