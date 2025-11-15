// Load environment variables for standalone worker execution (e.g., via tsx)
import 'dotenv/config';

import { workerEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';
import { getGenerationProvider } from '@/lib/ai/provider-factory';
import { JOB_TYPES } from '@/lib/jobs/types';

import { PlanGenerationWorker } from './plan-generator';
import { GenerationService } from './services/generation-service';
import { CurationService } from './services/curation-service';
import { PersistenceService } from './services/persistence-service';
import { PlanGenerationHandler } from './handlers/plan-generation-handler';
import { PlanRegenerationHandler } from './handlers/plan-regeneration-handler';

const SHUTDOWN_TIMEOUT_MS = 30_000;

// Initialize services (shared across handlers)
const provider = getGenerationProvider();
const generationService = new GenerationService(provider);
const curationService = new CurationService(provider);
const persistenceService = new PersistenceService();

// Initialize handlers with services
const planGenerationHandler = new PlanGenerationHandler(
  generationService,
  curationService,
  persistenceService
);

const planRegenerationHandler = new PlanRegenerationHandler(
  generationService,
  curationService,
  persistenceService
);

// Initialize worker with handlers
const worker = new PlanGenerationWorker({
  pollIntervalMs: workerEnv.pollIntervalMs,
  concurrency: workerEnv.concurrency,
  gracefulShutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
  handlers: {
    [JOB_TYPES.PLAN_GENERATION]: planGenerationHandler,
    [JOB_TYPES.PLAN_REGENERATION]: planRegenerationHandler,
  },
});

try {
  worker.start();
} catch (error) {
  logger.error({ error }, 'Failed to start plan generation worker');
  process.exit(1);
}

let shuttingDown = false;

/**
 * Handles graceful shutdown of the worker upon receiving a termination signal.
 * Ensures the worker is stopped properly and logs relevant events.
 * @param signal - The Node.js signal that triggered the shutdown (e.g., SIGTERM, SIGINT).
 */
async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(
    {
      source: 'plan-generation-worker',
      event: 'shutdown_signal',
      signal,
    },
    'Received shutdown signal'
  );

  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Worker shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms in index handler`
        )
      );
    }, SHUTDOWN_TIMEOUT_MS);
  });

  try {
    await Promise.race([worker.stop(), timeoutPromise]);
    process.exit(0);
  } catch (error) {
    logger.error(
      {
        source: 'plan-generation-worker',
        event: 'shutdown_error',
        error,
      },
      'Failed to stop worker during shutdown'
    );
    process.exit(1);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

// Handle termination signals for graceful shutdown
process.once('SIGTERM', (signal) => {
  shutdown(signal).catch((error) => {
    logger.error(
      {
        source: 'plan-generation-worker',
        event: 'shutdown_error',
        error,
      },
      'Shutdown handler failed after SIGTERM'
    );
    process.exit(1);
  });
});

process.once('SIGINT', (signal) => {
  shutdown(signal).catch((error) => {
    logger.error(
      {
        source: 'plan-generation-worker',
        event: 'shutdown_error',
        error,
      },
      'Shutdown handler failed after SIGINT'
    );
    process.exit(1);
  });
});
