import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  revalidatePathMock,
  withServerActionContextMock,
  setTaskProgressMock,
  setTaskProgressBatchMock,
  getLearningPlanDetailMock,
  getPlanScheduleMock,
  getDbMock,
  loggerMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  withServerActionContextMock: vi.fn(),
  setTaskProgressMock: vi.fn(),
  setTaskProgressBatchMock: vi.fn(),
  getLearningPlanDetailMock: vi.fn(),
  getPlanScheduleMock: vi.fn(),
  getDbMock: vi.fn(),
  loggerMock: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock('@/lib/api/auth', () => ({
  withServerActionContext: withServerActionContextMock,
}));

vi.mock('@/lib/api/schedule', () => ({
  getPlanSchedule: getPlanScheduleMock,
  ScheduleFetchError: class ScheduleFetchError extends Error {
    code?: string;
  },
  SCHEDULE_FETCH_ERROR_CODE: {
    PLAN_NOT_FOUND_OR_ACCESS_DENIED: 'PLAN_NOT_FOUND_OR_ACCESS_DENIED',
    INVALID_WEEKLY_HOURS: 'INVALID_WEEKLY_HOURS',
    SCHEDULE_GENERATION_FAILED: 'SCHEDULE_GENERATION_FAILED',
  },
}));

vi.mock('@/lib/db/queries/plans', () => ({
  getLearningPlanDetail: getLearningPlanDetailMock,
}));

vi.mock('@/lib/db/queries/tasks', () => ({
  setTaskProgress: setTaskProgressMock,
  setTaskProgressBatch: setTaskProgressBatchMock,
}));

vi.mock('@/lib/db/runtime', () => ({
  getDb: getDbMock,
}));

vi.mock('@/lib/logging/logger', () => ({
  logger: loggerMock,
}));

import { batchUpdateTaskProgressAction } from '@/app/plans/[id]/actions';

describe('batchUpdateTaskProgressAction', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects oversized update batches before auth or persistence work', async () => {
    const oversizedUpdates = Array.from({ length: 501 }, (_, index) => ({
      taskId: `task-${index}`,
      status: 'completed' as const,
    }));

    await expect(
      batchUpdateTaskProgressAction({
        planId: 'plan-123',
        updates: oversizedUpdates,
      })
    ).rejects.toThrow(
      'Batch update limit exceeded: received 501 updates, but the maximum allowed is 500.'
    );

    expect(withServerActionContextMock).not.toHaveBeenCalled();
    expect(setTaskProgressBatchMock).not.toHaveBeenCalled();
    expect(setTaskProgressMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
