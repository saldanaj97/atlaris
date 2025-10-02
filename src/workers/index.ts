// Load environment variables for standalone worker execution (e.g., via tsx)
import 'dotenv/config';

import { PlanGenerationWorker } from './plan-generator';

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const worker = new PlanGenerationWorker({
  pollIntervalMs: parseNumber(process.env.WORKER_POLL_INTERVAL_MS, 2000),
  concurrency: parseNumber(process.env.WORKER_CONCURRENCY, 1),
});

worker.start();

let shuttingDown = false;

/**
 * Handles graceful shutdown of the worker upon receiving a termination signal.
 * Ensures the worker is stopped properly and logs relevant events.
 * @param signal - The Node.js signal that triggered the shutdown (e.g., SIGTERM, SIGINT).
 */
async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.info(
    JSON.stringify({
      source: 'plan-generation-worker',
      level: 'info',
      event: 'shutdown_signal',
      signal,
    })
  );

  try {
    await worker.stop();
    process.exit(0);
  } catch (error) {
    console.error(
      JSON.stringify({
        source: 'plan-generation-worker',
        level: 'error',
        event: 'shutdown_error',
        message: error instanceof Error ? error.message : String(error),
      })
    );
    process.exit(1);
  }
}

// Handle termination signals for graceful shutdown
process.once('SIGTERM', (signal) => {
  shutdown(signal).catch((error) => {
    console.error(
      JSON.stringify({
        source: 'plan-generation-worker',
        level: 'error',
        event: 'shutdown_error',
        message: error instanceof Error ? error.message : String(error),
      })
    );
    process.exit(1);
  });
});

process.once('SIGINT', (signal) => {
  shutdown(signal).catch((error) => {
    console.error(
      JSON.stringify({
        source: 'plan-generation-worker',
        level: 'error',
        event: 'shutdown_error',
        message: error instanceof Error ? error.message : String(error),
      })
    );
    process.exit(1);
  });
});
