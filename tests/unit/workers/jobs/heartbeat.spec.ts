import { withInvocationDb } from '../../../../workers/jobs/src/db';
import {
  type HeartbeatDeps,
  HEARTBEAT_MONITOR_CONFIG,
  HEARTBEAT_MONITOR_SLUG,
  runHeartbeat,
} from '../../../../workers/jobs/src/jobs/heartbeat';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pg = vi.hoisted(() => ({
  instances: [] as Array<{
    options: unknown;
    query: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  }>,
  queryResult: { rows: [{ ok: 1 }] } as unknown,
}));

vi.mock('pg', () => ({
  Pool: class {
    options: unknown;
    query = vi.fn(async () => pg.queryResult);
    end = vi.fn(async () => undefined);
    constructor(options: unknown) {
      this.options = options;
      pg.instances.push(this);
    }
  },
}));

const hyperdrive = {
  connectionString: 'postgres://u:p@127.0.0.1:5432/postgres',
};

function makeDeps(paused = false) {
  const ctx = { waitUntil: vi.fn() };
  const logger = { info: vi.fn() };
  const withMonitor = vi.fn(
    (_slug: string, fn: () => Promise<unknown>): Promise<unknown> => fn(),
  );
  const deps: HeartbeatDeps = {
    paused,
    logger,
    withDb: (fn) => withInvocationDb(hyperdrive, ctx, fn),
    withMonitor: withMonitor as HeartbeatDeps['withMonitor'],
  };
  return { ctx, logger, withMonitor, deps };
}

describe('runHeartbeat', () => {
  beforeEach(() => {
    pg.instances.length = 0;
    pg.queryResult = { rows: [{ ok: 1 }] };
  });

  it('skips all work while jobs are paused', async () => {
    const { deps, ctx, logger, withMonitor } = makeDeps(true);

    await expect(runHeartbeat(deps)).resolves.toBe('paused');

    expect(pg.instances).toHaveLength(0);
    expect(withMonitor).not.toHaveBeenCalled();
    expect(ctx.waitUntil).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      { job: 'heartbeat' },
      'Jobs paused; heartbeat skipped',
    );
  });

  it('runs SELECT 1 on a per-invocation pool inside the Sentry monitor', async () => {
    const { deps, ctx, logger, withMonitor } = makeDeps();

    await expect(runHeartbeat(deps)).resolves.toBe('ok');

    expect(withMonitor).toHaveBeenCalledWith(
      HEARTBEAT_MONITOR_SLUG,
      expect.any(Function),
      HEARTBEAT_MONITOR_CONFIG,
    );
    expect(HEARTBEAT_MONITOR_SLUG).toBe('jobs-heartbeat');
    expect(pg.instances).toHaveLength(1);
    const [pool] = pg.instances;
    expect(pool?.options).toEqual({
      connectionString: hyperdrive.connectionString,
      max: 5,
    });
    expect(pool?.query).toHaveBeenCalledTimes(1);
    expect(pool?.query.mock.calls[0]?.[0]).toMatchObject({
      text: 'select 1 as ok',
    });
    expect(pool?.end).toHaveBeenCalledTimes(1);
    expect(ctx.waitUntil).toHaveBeenCalledWith(
      pool?.end.mock.results[0]?.value,
    );
    expect(logger.info).toHaveBeenCalledWith(
      { job: 'heartbeat' },
      'Heartbeat database check passed',
    );
  });

  it('fails the run and still ends the pool when the query result is wrong', async () => {
    pg.queryResult = { rows: [] };
    const { deps, ctx, logger } = makeDeps();

    await expect(runHeartbeat(deps)).rejects.toThrow(
      'Heartbeat query returned an unexpected result.',
    );
    expect(pg.instances[0]?.end).toHaveBeenCalledTimes(1);
    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
  });
});
