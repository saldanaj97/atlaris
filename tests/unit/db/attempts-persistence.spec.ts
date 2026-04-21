import {
  beforeEach,
  describe,
  expect,
  it,
  type MockedFunction,
  vi,
} from 'vitest';

import { persistSuccessfulAttempt } from '@/lib/db/queries/helpers/attempts-persistence';
import * as rlsJwtClaims from '@/lib/db/queries/helpers/rls-jwt-claims';
import type { FinalizeSuccessPersistenceParams } from '@/lib/db/queries/types/attempts.types';
import { generationAttempts, modules, tasks } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import type { DbClient } from '@/lib/db/types';

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

/** Wire db.transaction to invoke the callback with the given mock tx. */
function useMockTransaction(mockTx: ReturnType<typeof createMockTx>): void {
  const transactionMock = vi.mocked(db).transaction as MockedFunction<
    DbClient['transaction']
  >;

  transactionMock.mockImplementation(
    // Drizzle's transaction callback type is wider than the chain this test
    // stubs, but the helper only exercises execute/delete/insert/update.
    (fn) => fn(mockTx as never)
  );
}

describe('persistSuccessfulAttempt', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when task insertion returns fewer rows than expected', async () => {
    const mockTx = createMockTx({ taskReturnRows: [] });
    useMockTransaction(mockTx); // 0 rows returned but 1 task expected

    await expect(persistSuccessfulAttempt(createBaseParams())).rejects.toThrow(
      'Failed to insert generated tasks for attempt'
    );
    expect(mockTx.update).not.toHaveBeenCalled();
  });

  it('returns the attempt record when all operations succeed', async () => {
    const mockTx = createMockTx();
    useMockTransaction(mockTx);

    const result = await persistSuccessfulAttempt(createBaseParams());
    expect(result).toEqual(mockAttemptRecord);
    expect(mockTx.update).toHaveBeenCalledTimes(1);
    expect(mockTx.update).toHaveBeenCalledWith(generationAttempts);
  });

  it('reapplies RLS context before deleting and replacing persisted rows', async () => {
    const mockTx = createMockTx({
      attemptReturnRow: {
        ...mockAttemptRecord,
        normalizedEffort: true,
      },
    });
    useMockTransaction(mockTx);

    const rlsContext = {
      shouldNormalizeRlsContext: true,
      requestJwtClaims: '{"sub":"auth-user-1"}',
    };
    const prepareSpy = vi
      .spyOn(rlsJwtClaims, 'prepareRlsTransactionContext')
      .mockResolvedValue(rlsContext);
    const reapplySpy = vi
      .spyOn(rlsJwtClaims, 'reapplyJwtClaimsInTransaction')
      .mockResolvedValue(undefined);

    const params = createBaseParams({
      normalizationFlags: { modulesClamped: true, tasksClamped: false },
    });

    const result = await persistSuccessfulAttempt(params);

    expect(result.normalizedEffort).toBe(true);
    expect(prepareSpy).toHaveBeenCalledWith(params.dbClient);
    expect(reapplySpy).toHaveBeenCalledWith(mockTx, rlsContext);
    expect(mockTx.spies.attemptSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        modulesCount: 1,
        tasksCount: 1,
        normalizedEffort: true,
      })
    );
    expect(mockTx.delete.mock.invocationCallOrder[0]).toBeLessThan(
      mockTx.insert.mock.invocationCallOrder[0]
    );
    expect(mockTx.insert.mock.invocationCallOrder[0]).toBeLessThan(
      mockTx.update.mock.invocationCallOrder[0]
    );
  });
});
