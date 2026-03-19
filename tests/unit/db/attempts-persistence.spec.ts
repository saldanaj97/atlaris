import { beforeEach, describe, expect, it, vi } from 'vitest';

import { persistSuccessfulAttempt } from '@/lib/db/queries/helpers/attempts-persistence';
import { generationAttempts, modules, tasks } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

import type { FinalizeSuccessPersistenceParams } from '@/lib/db/queries/types/attempts.types';

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
};

function createBaseParams(
  overrides?: Partial<FinalizeSuccessPersistenceParams>
): FinalizeSuccessPersistenceParams {
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
    dbClient: db,
    ...overrides,
  } as FinalizeSuccessPersistenceParams;
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

  return {
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
    insert: vi.fn(((table: unknown) => {
      if (table === modules) {
        return {
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue(moduleReturnRows),
          })),
        };
      }
      if (table === tasks) {
        return {
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue(taskReturnRows),
          })),
        };
      }
      throw new Error(`Unexpected insert table: ${String(table)}`);
    }) as MockTxInsert),
    update: vi.fn(((table: unknown) => {
      if (table === generationAttempts) {
        return {
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi
                .fn()
                .mockResolvedValue(attemptReturnRow ? [attemptReturnRow] : []),
            })),
          })),
        };
      }
      throw new Error(`Unexpected update table: ${String(table)}`);
    }) as MockTxUpdate),
  };
}

/** Wire db.transaction to invoke the callback with the given mock tx. */
function useMockTransaction(mockTx: ReturnType<typeof createMockTx>): void {
  (vi.mocked(db).transaction as any).mockImplementation(
    (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)
  );
}

describe('persistSuccessfulAttempt', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when task insertion returns fewer rows than expected', async () => {
    useMockTransaction(
      createMockTx({ taskReturnRows: [] }) // 0 rows returned but 1 task expected
    );

    await expect(persistSuccessfulAttempt(createBaseParams())).rejects.toThrow(
      'Failed to insert all tasks for generation attempt.'
    );
  });

  it('returns the attempt record when all operations succeed', async () => {
    const mockTx = createMockTx();
    useMockTransaction(mockTx);

    const result = await persistSuccessfulAttempt(createBaseParams());
    expect(result).toEqual(mockAttemptRecord);
    expect(mockTx.update).toHaveBeenCalledTimes(1);
    expect(mockTx.update).toHaveBeenCalledWith(generationAttempts);
  });
});
