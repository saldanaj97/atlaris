// Load environment variables for standalone worker execution (e.g., via tsx)
import 'dotenv/config';

import { workerEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';

import { PlanGenerationWorker } from './plan-generator';

const SHUTDOWN_TIMEOUT_MS = 30_000;

const worker = new PlanGenerationWorker({
  pollIntervalMs: workerEnv.pollIntervalMs,
  concurrency: workerEnv.concurrency,
  gracefulShutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
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
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    process.exit(0);
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    logger.error(
      {
        source: 'plan-generation-worker',
        event: 'shutdown_error',
        error,
      },
      'Failed to stop worker during shutdown'
    );
    process.exit(1);
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
