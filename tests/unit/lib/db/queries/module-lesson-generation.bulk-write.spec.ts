import type { DbClient } from '@/lib/db/types';

import { commitModuleLessonBatchSuccess } from '@/lib/db/queries/module-lesson-generation';
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
