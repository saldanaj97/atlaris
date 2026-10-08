import type { DbClient } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';
import type { withMonitor as sentryWithMonitor } from '@sentry/cloudflare';

import { executeRows } from '@/lib/db/execute-rows';
import { sql } from 'drizzle-orm';

type MonitorConfig = NonNullable<Parameters<typeof sentryWithMonitor>[2]>;

export const HEARTBEAT_CRON = '*/15 * * * *';
export const HEARTBEAT_MONITOR_SLUG = 'jobs-heartbeat';

export const HEARTBEAT_MONITOR_CONFIG: MonitorConfig = {
  schedule: { type: 'crontab', value: HEARTBEAT_CRON },
  checkinMargin: 5,
  maxRuntime: 5,
  timezone: 'Etc/UTC',
};

export type HeartbeatDeps = {
  paused: boolean;
  logger: Pick<Logger, 'info'>;
  /** Runs `fn` with this invocation's database client. */
  withDb: <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;
  /** Reports the run to the Sentry cron monitor. */
  withMonitor: <T>(
    slug: string,
    fn: () => Promise<T>,
    config: MonitorConfig,
  ) => Promise<T>;
};

export type HeartbeatResult = 'paused' | 'ok';

/**
 * Proves the scheduled path end to end until real jobs land (B3a):
 * `SELECT 1` through Hyperdrive, a log line, and a Sentry check-in.
 * When jobs are paused it logs and skips; Sentry then reports a missed run.
 */
export async function runHeartbeat(
  deps: HeartbeatDeps,
): Promise<HeartbeatResult> {
  if (deps.paused) {
    deps.logger.info({ job: 'heartbeat' }, 'Jobs paused; heartbeat skipped');
    return 'paused';
  }

  return deps.withMonitor(
    HEARTBEAT_MONITOR_SLUG,
    async () => {
      const [row] = await deps.withDb((db) =>
        executeRows<{ ok: number }>(db, sql`select 1 as ok`),
      );
      if (row?.ok !== 1) {
        throw new Error('Heartbeat query returned an unexpected result.');
      }
      deps.logger.info({ job: 'heartbeat' }, 'Heartbeat database check passed');
      return 'ok' as const;
    },
    HEARTBEAT_MONITOR_CONFIG,
  );
}
