import type { DbClient } from '@/lib/db/types';

import {
  commitModuleLessonBatchSuccess,
  markModuleLessonProviderStarted,
} from '@/lib/db/queries/module-lesson-generation';
import { SERVICE_ROLE_DB_MARKER } from '@supabase/service-role';
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
  const providerStartedAt = '2026-08-20T18:00:00.000Z';

  function mockNoMatchingRow() {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const limit = vi.fn().mockResolvedValue([]);
    const selectWhere = vi.fn().mockReturnValue({ limit });
    const innerJoin = vi.fn().mockReturnValue({ where: selectWhere });
    const from = vi.fn().mockReturnValue({ innerJoin });
    const select = vi.fn().mockReturnValue({ from });
    const tx = { select, update };
    return {
      transaction: vi.fn(async (callback: (innerTx: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as unknown as DbClient;
  }

  it('throws unless exactly one generating row matches', async () => {
    const dbClient = mockNoMatchingRow();

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
