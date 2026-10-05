import { withInvocationDb } from './db';
import { parseWorkerEnv, type WorkerEnv } from './env';
import { handleFetch } from './http/router';
import { HEARTBEAT_CRON, runHeartbeat } from './jobs/heartbeat';
import { isJobsPaused } from './switches';
import { createLogger } from '@/lib/logging/logger';
import { beforeSendSentryEvent } from '@/lib/observability/sentry-filters';
import * as Sentry from '@sentry/cloudflare';

const logger = createLogger({ runtime: 'cloudflare-worker' });

export default Sentry.withSentry<WorkerEnv>(
  (env) => ({
    // Empty until B1 supplies the atlaris-jobs DSN; Sentry stays disabled.
    dsn: env.SENTRY_DSN || undefined,
    environment: env.WORKER_ENV,
    // Workers Builds deploys with --var SENTRY_RELEASE:<commit SHA>.
    release: env.SENTRY_RELEASE ?? env.CF_VERSION_METADATA.id,
    sendDefaultPii: false,
    beforeSend: beforeSendSentryEvent,
    initialScope: { tags: { runtime: 'cloudflare-worker' } },
  }),
  {
    fetch(request, env) {
      return handleFetch(request, parseWorkerEnv(env));
    },

    async scheduled(controller, env, ctx) {
      const workerEnv = parseWorkerEnv(env);

      switch (controller.cron) {
        case HEARTBEAT_CRON:
          await runHeartbeat({
            paused: isJobsPaused(workerEnv),
            logger,
            withDb: (fn) => withInvocationDb(workerEnv.HYPERDRIVE, ctx, fn),
            withMonitor: Sentry.withMonitor,
          });
          return;
        default:
          logger.warn({ cron: controller.cron }, 'No job for this cron');
      }
    },
  } satisfies ExportedHandler<WorkerEnv>,
);
