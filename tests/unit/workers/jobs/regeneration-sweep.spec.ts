import type { DbClient } from '@/lib/db/types';

import {
  claimRegenerationSweepJobIds,
  runRegenerationSweep,
  type RegenerationSweepDeps,
} from '../../../../workers/jobs/src/jobs/regeneration-sweep';
import * as schema from '@supabase/schema';
import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';

const TAGS = { job: 'regeneration', runtime: 'cloudflare-worker' };

function makeDeps(
  env: Record<string, string> = { JOB_REGENERATION_ENABLED: 'true' },
  jobIds: string[] = ['job-a', 'job-b'],
) {
  const sendBatch = vi.fn(async () => ({
    metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
  }));
  const claimJobIds = vi.fn(async () => jobIds);
  const fakeDb = {} as DbClient;
  const deps = {
    env,
    logger: { info: vi.fn() },
    captureException: vi.fn(),
    withDb: vi.fn(async (fn) => fn(fakeDb)) as RegenerationSweepDeps['withDb'],
    queue: { sendBatch },
    claimJobIds,
  } satisfies RegenerationSweepDeps;
  return { deps, sendBatch, claimJobIds, fakeDb };
}

describe('runRegenerationSweep', () => {
  it.each([
    ['paused', { JOBS_PAUSED: 'true', JOB_REGENERATION_ENABLED: 'true' }],
    ['disabled', {}],
  ] as const)(
    'skips without touching the database while %s',
    async (state, env) => {
      const { deps, sendBatch } = makeDeps(env);

      await expect(runRegenerationSweep(deps)).resolves.toEqual({
        kind: 'skipped',
        switchState: state,
      });
      expect(deps.withDb).not.toHaveBeenCalled();
      expect(sendBatch).not.toHaveBeenCalled();
    },
  );

  it('re-sends every selected job as a { v: 1, jobId } message', async () => {
    const { deps, sendBatch, claimJobIds, fakeDb } = makeDeps();

    await expect(runRegenerationSweep(deps)).resolves.toEqual({
      kind: 'swept',
      resent: 2,
    });
    expect(claimJobIds).toHaveBeenCalledWith(fakeDb);
    expect(sendBatch).toHaveBeenCalledWith([
      { body: { v: 1, jobId: 'job-a' } },
      { body: { v: 1, jobId: 'job-b' } },
    ]);
  });

  it('sends nothing when no job is due', async () => {
    const { deps, sendBatch } = makeDeps(undefined, []);

    await expect(runRegenerationSweep(deps)).resolves.toEqual({
      kind: 'swept',
      resent: 0,
    });
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it('reports and rethrows a failed send', async () => {
    const { deps, sendBatch } = makeDeps();
    const failure = new Error('queue down');
    sendBatch.mockRejectedValueOnce(failure);

    await expect(runRegenerationSweep(deps)).rejects.toBe(failure);
    expect(deps.captureException).toHaveBeenCalledWith(failure, {
      tags: TAGS,
      extra: { phase: 'sweep' },
    });
  });
});

describe('claimRegenerationSweepJobIds', () => {
  it('touches only due pending regeneration rows untouched for 10 minutes', async () => {
    // Drizzle asks node-postgres for array rows on `returning`.
    const query = vi.fn(async () => ({
      rows: [['job-a']],
      rowCount: 1,
      command: 'UPDATE',
      fields: [],
    }));
    const db = drizzle({ client: { query } as never, schema }) as DbClient;

    await expect(claimRegenerationSweepJobIds(db, 25)).resolves.toEqual([
      'job-a',
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    const [{ text }, values] = query.mock.calls[0] as unknown as [
      { text: string },
      unknown[],
    ];
    const sql = text.replace(/\s+/g, ' ');
    expect(sql).toMatch(/^update "job_queue" set "updated_at" = now\(\)/);
    expect(sql).toContain(
      'where "job_queue"."id" in (select "id" from "job_queue"',
    );
    expect(sql).toContain('"job_queue"."status" = $1');
    expect(sql).toContain('"job_queue"."job_type" = $2');
    expect(sql).toContain('"job_queue"."scheduled_for" <= now()');
    expect(sql).toContain(
      '"job_queue"."updated_at" <= now() - make_interval(mins => $3)',
    );
    expect(sql).toContain(
      'order by "job_queue"."priority" desc, "job_queue"."created_at" asc limit $4 for update skip locked)',
    );
    expect(values).toEqual(['pending', 'plan_regeneration', 10, 25]);
  });
});
