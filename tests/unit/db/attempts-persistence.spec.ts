import type { FinalizeSuccessPersistenceInTxParams } from '@/lib/db/queries/types/attempts.types';

import { persistSuccessfulAttemptInTx } from '@/lib/db/queries/helpers/attempts-persistence-success';
import { generationAttempts, modules, tasks } from '@supabase/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal mock attempt record returned by the generationAttempts update
const mockAttemptRecord = {
  id: 'attempt-1',
  planId: 'plan-1',
  status: 'success' as const,
  classification: null,
  durationMs: 1000,
  modulesCount: 1,
  tasksCount: 1,
  truncatedTopic: false,
  truncatedNotes: false,
  normalizedEffort: false,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  generationPurpose: 'initial' as const,
};

function createBaseParams(
  overrides?: Partial<FinalizeSuccessPersistenceInTxParams>,
): FinalizeSuccessPersistenceInTxParams {
  return {
    attemptId: 'attempt-1',
    planId: 'plan-1',
    preparation: {
      attemptId: 'attempt-1',
      sanitized: {
        topic: { truncated: false },
        notes: { truncated: false },
      },
    },
    normalizedModules: [
      {
        title: 'Module 1',
        description: 'Desc',
        estimatedMinutes: 60,
        tasks: [
          {
            title: 'Task 1',
            description: 'Task desc',
            estimatedMinutes: 30,
          },
        ],
      },
    ],
    normalizationFlags: { modulesClamped: false, tasksClamped: false },
    modulesCount: 1,
    tasksCount: 1,
    durationMs: 1000,
    metadata: {},
    finishedAt: new Date(),
    ...overrides,
  } as FinalizeSuccessPersistenceInTxParams;
}

type MockTxInsert = (table: unknown) => {
  values: ReturnType<typeof vi.fn>;
};
type MockTxUpdate = (table: unknown) => {
  set: ReturnType<typeof vi.fn>;
};

function createMockTx(options?: {
  moduleReturnRows?: Array<{ id: string }>;
  taskReturnRows?: Array<{ id: string }>;
  attemptReturnRow?: typeof mockAttemptRecord | undefined;
}) {
  const {
    moduleReturnRows = [{ id: 'mod-1' }],
    taskReturnRows = [{ id: 'task-1' }],
    attemptReturnRow = mockAttemptRecord,
  } = options ?? {};

  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const moduleValues = vi.fn(() => ({
    returning: vi.fn().mockResolvedValue(moduleReturnRows),
  }));
  const taskValues = vi.fn(() => ({
    returning: vi.fn().mockResolvedValue(taskReturnRows),
  }));
  const attemptReturning = vi
    .fn()
    .mockResolvedValue(attemptReturnRow ? [attemptReturnRow] : []);
  const attemptWhere = vi.fn(() => ({
    returning: attemptReturning,
  }));
  const attemptSet = vi.fn(() => ({
    where: attemptWhere,
  }));

  return {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    delete: vi.fn(() => ({
      where: deleteWhere,
    })),
    insert: vi.fn(((table: unknown) => {
      if (table === modules) {
        return {
          values: moduleValues,
        };
      }
      if (table === tasks) {
        return {
          values: taskValues,
        };
      }
      throw new Error(`Unexpected insert table: ${String(table)}`);
    }) as MockTxInsert),
    update: vi.fn(((table: unknown) => {
      if (table === generationAttempts) {
        return {
          set: attemptSet,
        };
      }
      throw new Error(`Unexpected update table: ${String(table)}`);
    }) as MockTxUpdate),
    spies: {
      deleteWhere,
      moduleValues,
      taskValues,
      attemptSet,
      attemptWhere,
      attemptReturning,
    },
  };
}

describe('persistSuccessfulAttemptInTx', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when task insertion returns fewer rows than expected', async () => {
    const mockTx = createMockTx({ taskReturnRows: [] });

    await expect(
      persistSuccessfulAttemptInTx(mockTx as never, createBaseParams()),
    ).rejects.toThrow('Failed to insert generated tasks for attempt');
    expect(mockTx.update).not.toHaveBeenCalled();
  });

  it('returns the attempt record when all operations succeed', async () => {
    const mockTx = createMockTx();

    const result = await persistSuccessfulAttemptInTx(
      mockTx as never,
      createBaseParams(),
    );
    expect(result).toEqual(mockAttemptRecord);
    expect(mockTx.update).toHaveBeenCalledTimes(1);
    expect(mockTx.update).toHaveBeenCalledWith(generationAttempts);
  });

  it('persists normalized effort before replacing persisted rows', async () => {
    const mockTx = createMockTx({
      attemptReturnRow: {
        ...mockAttemptRecord,
        normalizedEffort: true,
      },
    });
    const params = createBaseParams({
      normalizationFlags: { modulesClamped: true, tasksClamped: false },
    });

    const result = await persistSuccessfulAttemptInTx(mockTx as never, params);

    expect(result.normalizedEffort).toBe(true);
    expect(mockTx.spies.attemptSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        modulesCount: 1,
        tasksCount: 1,
        normalizedEffort: true,
      }),
    );
    expect(mockTx.delete.mock.invocationCallOrder[0]).toBeLessThan(
      mockTx.insert.mock.invocationCallOrder[0],
    );
    expect(mockTx.insert.mock.invocationCallOrder[0]).toBeLessThan(
      mockTx.update.mock.invocationCallOrder[0],
    );
  });

  it('throws before replacing modules when a child lesson generation is active', async () => {
    const mockTx = createMockTx();
    mockTx.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 'mod-generating' }]),
        }),
      }),
    });

    await expect(
      persistSuccessfulAttemptInTx(mockTx as never, createBaseParams()),
    ).rejects.toThrow('active child module lesson generation is in progress');
    expect(mockTx.delete).not.toHaveBeenCalled();
  });
});
