import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TasksDbClient } from '@/lib/db/queries/types/tasks.types';

const { setTaskProgressBatchMock } = vi.hoisted(() => ({
  setTaskProgressBatchMock: vi.fn(),
}));

vi.mock('@/lib/db/queries/tasks', () => ({
  setTaskProgressBatch: setTaskProgressBatchMock,
}));

import { applyTaskProgressUpdates } from '@/features/plans/task-progress';

describe('applyTaskProgressUpdates', () => {
  const dbClient = {} as TasksDbClient;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('validates direct callers before scope checks or persistence', async () => {
    await expect(
      applyTaskProgressUpdates({
        userId: 'user-1',
        planId: 'plan-1',
        updates: [{ taskId: '   ', status: 'completed' }],
        dbClient,
      }),
    ).rejects.toThrow(
      'A task id is required to update progress for update at index 0',
    );

    expect(setTaskProgressBatchMock).not.toHaveBeenCalled();
  });

  it('rejects duplicate task ids before persistence', async () => {
    await expect(
      applyTaskProgressUpdates({
        userId: 'user-1',
        planId: 'plan-1',
        updates: [
          { taskId: ' task-1 ', status: 'in_progress' },
          { taskId: 'task-1', status: 'completed' },
        ],
        dbClient,
      }),
    ).rejects.toThrow('Duplicate taskIds in updates: task-1');

    expect(setTaskProgressBatchMock).not.toHaveBeenCalled();
  });

  it('passes validated updates through without rewriting caller input', async () => {
    setTaskProgressBatchMock.mockResolvedValueOnce([
      {
        taskId: 'task-1',
        status: 'completed',
      },
    ]);

    const result = await applyTaskProgressUpdates({
      userId: 'user-1',
      planId: 'plan-1',
      updates: [{ taskId: 'task-1', status: 'completed' }],
      dbClient,
    });

    expect(setTaskProgressBatchMock).toHaveBeenCalledWith(
      'user-1',
      [{ taskId: 'task-1', status: 'completed' }],
      dbClient,
      { planId: 'plan-1', moduleId: undefined },
    );
    expect(result.visibleState.appliedByTaskId).toEqual({
      'task-1': 'completed',
    });
  });

  it('passes module scope into the transactional batch write', async () => {
    setTaskProgressBatchMock.mockResolvedValueOnce([]);

    await applyTaskProgressUpdates({
      userId: 'user-1',
      planId: 'plan-1',
      moduleId: 'module-1',
      updates: [{ taskId: 'task-1', status: 'completed' }],
      dbClient,
    });

    expect(setTaskProgressBatchMock).toHaveBeenCalledWith(
      'user-1',
      [{ taskId: 'task-1', status: 'completed' }],
      dbClient,
      { planId: 'plan-1', moduleId: 'module-1' },
    );
  });
});
