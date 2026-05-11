import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/queries/tasks', () => ({
  setTaskProgressBatch: vi.fn(),
}));

vi.mock('@/lib/observability/metrics', () => ({
  countMetric: vi.fn(),
}));

import { applyTaskProgressUpdates } from '@/features/plans/task-progress/boundary';
import { setTaskProgressBatch } from '@/lib/db/queries/tasks';
import { countMetric } from '@/lib/observability/metrics';

describe('task progress metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts completed task writes after progress is persisted', async () => {
    vi.mocked(setTaskProgressBatch).mockResolvedValue([
      {
        id: 'progress-1',
        taskId: 'task-1',
        userId: 'user-1',
        status: 'completed',
        completedAt: new Date('2026-05-11T00:00:00.000Z'),
        updatedAt: new Date('2026-05-11T00:00:00.000Z'),
        createdAt: new Date('2026-05-11T00:00:00.000Z'),
      },
      {
        id: 'progress-2',
        taskId: 'task-2',
        userId: 'user-1',
        status: 'not_started',
        completedAt: null,
        updatedAt: new Date('2026-05-11T00:00:00.000Z'),
        createdAt: new Date('2026-05-11T00:00:00.000Z'),
      },
    ]);

    await applyTaskProgressUpdates({
      userId: 'user-1',
      planId: 'plan-1',
      moduleId: 'module-1',
      updates: [
        { taskId: 'task-1', status: 'completed' },
        { taskId: 'task-2', status: 'not_started' },
      ],
      dbClient: {} as never,
    });

    expect(countMetric).toHaveBeenCalledWith(
      'atlaris.learning.task_completed',
      1,
      {
        attributes: {
          scope: 'module',
        },
      },
    );
  });

  it('does not emit completion metrics when no task is completed', async () => {
    vi.mocked(setTaskProgressBatch).mockResolvedValue([
      {
        id: 'progress-1',
        taskId: 'task-1',
        userId: 'user-1',
        status: 'in_progress',
        completedAt: null,
        updatedAt: new Date('2026-05-11T00:00:00.000Z'),
        createdAt: new Date('2026-05-11T00:00:00.000Z'),
      },
    ]);

    await applyTaskProgressUpdates({
      userId: 'user-1',
      planId: 'plan-1',
      updates: [{ taskId: 'task-1', status: 'in_progress' }],
      dbClient: {} as never,
    });

    expect(countMetric).not.toHaveBeenCalled();
  });
});
