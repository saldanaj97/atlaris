import type { DbClient } from '@/lib/db/types';

import {
  commitModuleLessonBatchSuccess,
  markModuleLessonProviderStarted,
} from '@/lib/db/queries/module-lesson-generation';
import { SERVICE_ROLE_DB_MARKER } from '@supabase/service-role';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

describe('commitModuleLessonBatchSuccess bulk task writes', () => {
  it('issues one bulk UPDATE for all task lessons inside the transaction', async () => {
    const taskIds = ['task-1', 'task-2', 'task-3', 'task-4', 'task-5'];
    const tx = {
      execute: vi.fn(async () => taskIds.map((id) => ({ id }))),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(taskIds.map((id) => ({ id }))),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'module-1' }]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
    };

    const dbClient = {
      [SERVICE_ROLE_DB_MARKER]: true,
      execute: vi.fn().mockResolvedValue([]),
      transaction: vi.fn(async (callback: (innerTx: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as unknown as DbClient;

    await commitModuleLessonBatchSuccess(dbClient, {
      userId: 'user-1',
      planId: 'plan-1',
      moduleId: 'module-1',
      parsed: {
        version: 1,
        tasks: taskIds.map((taskId) => ({
          taskId,
          content: {
            version: 1 as const,
            blocks: [{ type: 'heading' as const, text: taskId }],
          },
        })),
      },
      metadata: { version: 1 },
      usage: {
        provider: 'mock',
        model: 'mock-module-lesson-batch-v1',
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
        estimatedCostCents: 0,
        providerCostMicrousd: null,
        isPartial: false,
        missingFields: [],
      },
    });

    expect(tx.execute).toHaveBeenCalledTimes(1);
  });
});

describe('markModuleLessonProviderStarted', () => {
  const pgDialect = new PgDialect();
  const providerStartedAt = '2026-08-20T18:00:00.000Z';

  function mockUpdate(
    returningRows: Array<{ id: string }>,
    replayState?: {
      status: 'generating';
      metadata: { version: 1; providerStartedAt: string };
    },
  ) {
    let capturedSet: { lessonGenerationMetadata?: SQL } | undefined;
    let capturedWhere: SQL | undefined;
    const returning = vi.fn().mockResolvedValue(returningRows);
    const where = vi.fn((clause: SQL) => {
      capturedWhere = clause;
      return { returning };
    });
    const set = vi.fn((values: { lessonGenerationMetadata?: SQL }) => {
      capturedSet = values;
      return { where };
    });
    const usageReturning = vi.fn().mockResolvedValue([{ id: 'usage-1' }]);
    const usageWhere = vi.fn().mockReturnValue({ returning: usageReturning });
    const usageSet = vi.fn().mockReturnValue({ where: usageWhere });
    const update = vi
      .fn()
      .mockReturnValueOnce({ set })
      .mockReturnValue({ set: usageSet });
    const insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    });
    const limit = vi.fn().mockResolvedValue(replayState ? [replayState] : []);
    const selectWhere = vi.fn().mockReturnValue({ limit });
    const innerJoin = vi.fn().mockReturnValue({ where: selectWhere });
    const from = vi.fn().mockReturnValue({ innerJoin });
    const select = vi.fn().mockReturnValue({ from });
    const tx = { insert, select, update };
    const dbClient = {
      transaction: vi.fn(async (callback: (innerTx: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as unknown as DbClient;
    return { dbClient, captured: () => ({ capturedSet, capturedWhere }) };
  }

  it('merges providerStartedAt into generating owned-module metadata', async () => {
    const { dbClient, captured } = mockUpdate([{ id: 'module-1' }]);

    await markModuleLessonProviderStarted(dbClient, {
      userId: 'user-1',
      planId: 'plan-1',
      moduleId: 'module-1',
      providerStartedAt,
    });

    const { capturedSet, capturedWhere } = captured();
    const setQuery = pgDialect.sqlToQuery(
      capturedSet?.lessonGenerationMetadata as SQL,
    );
    const whereQuery = pgDialect.sqlToQuery(capturedWhere as SQL);

    expect(setQuery.sql).toContain('jsonb_set');
    expect(setQuery.sql).toContain('providerStartedAt');
    expect(setQuery.params).toContain(providerStartedAt);
    expect(whereQuery.params).toEqual(
      expect.arrayContaining(['module-1', 'plan-1', 'generating', 'user-1']),
    );
    expect(whereQuery.sql).toContain('providerStartedAt');
    expect(whereQuery.sql).toContain('IS NULL');
  });

  it('treats an existing provider-start marker as an idempotent replay', async () => {
    const { dbClient } = mockUpdate([], {
      status: 'generating',
      metadata: { version: 1, providerStartedAt },
    });

    await expect(
      markModuleLessonProviderStarted(dbClient, {
        userId: 'user-1',
        planId: 'plan-1',
        moduleId: 'module-1',
        providerStartedAt: '2026-08-20T18:01:00.000Z',
      }),
    ).resolves.toBeUndefined();
  });

  it('throws unless exactly one generating row matches', async () => {
    const { dbClient } = mockUpdate([]);

    await expect(
      markModuleLessonProviderStarted(dbClient, {
        userId: 'user-1',
        planId: 'plan-1',
        moduleId: 'module-1',
        providerStartedAt,
      }),
    ).rejects.toThrow(
      'Module lesson generation provider-start marker did not match exactly one row',
    );
  });
});
