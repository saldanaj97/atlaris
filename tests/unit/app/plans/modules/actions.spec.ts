import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  revalidatePathMock,
  requestBoundaryActionMock,
  applyTaskProgressUpdatesMock,
  loggerMock,
} = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  requestBoundaryActionMock: vi.fn(),
  applyTaskProgressUpdatesMock: vi.fn(),
  loggerMock: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock('@/lib/api/request-boundary', () => ({
  requestBoundary: {
    action: requestBoundaryActionMock,
  },
}));

vi.mock('@/features/plans/task-progress/boundary', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/plans/task-progress/boundary')
  >('@/features/plans/task-progress/boundary');
  return {
    ...actual,
    applyTaskProgressUpdates: applyTaskProgressUpdatesMock,
  };
});

vi.mock('@/lib/logging/logger', () => ({
  logger: loggerMock,
}));

import type { RequestScope } from '@/lib/api/request-boundary';

import { batchUpdateModuleTaskProgressAction } from '@/app/(app)/plans/[id]/modules/[moduleId]/actions';
import { makeDbClient } from '@tests/fixtures/db-mocks';
import { buildUserFixture } from '@tests/fixtures/users';

const actionTestDb = makeDbClient();
const actionTestActor = buildUserFixture({ id: 'user-1' });

function makeActionTestScope(): RequestScope {
  return {
    actor: actionTestActor,
    db: actionTestDb,
    owned: { userId: actionTestActor.id, dbClient: actionTestDb },
    correlationId: 'test-correlation-id',
  };
}

const mockRequestBoundaryAction =
  (scope: RequestScope) =>
  async <T>(fn: (scope: RequestScope) => Promise<T>): Promise<T> =>
    fn(scope);

describe('batchUpdateModuleTaskProgressAction', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('checks auth before validating oversized batches', async () => {
    requestBoundaryActionMock.mockResolvedValueOnce(null);
    const updates = Array.from({ length: 501 }, (_, index) => ({
      taskId: `task-${index}`,
      status: 'completed' as const,
    }));

    await expect(
      batchUpdateModuleTaskProgressAction({
        planId: 'p1',
        moduleId: 'm1',
        updates,
      }),
    ).rejects.toThrow('You must be signed in to update progress.');

    expect(requestBoundaryActionMock).toHaveBeenCalledOnce();
    expect(applyTaskProgressUpdatesMock).not.toHaveBeenCalled();
  });

  it('rejects oversized batches after auth', async () => {
    requestBoundaryActionMock.mockImplementationOnce(
      mockRequestBoundaryAction(makeActionTestScope()),
    );
    const updates = Array.from({ length: 501 }, (_, index) => ({
      taskId: `task-${index}`,
      status: 'completed' as const,
    }));

    await expect(
      batchUpdateModuleTaskProgressAction({
        planId: 'p1',
        moduleId: 'm1',
        updates,
      }),
    ).rejects.toThrow(/Batch update limit exceeded/);

    expect(applyTaskProgressUpdatesMock).not.toHaveBeenCalled();
  });

  it('throws when unauthenticated', async () => {
    requestBoundaryActionMock.mockResolvedValueOnce(null);

    await expect(
      batchUpdateModuleTaskProgressAction({
        planId: 'p1',
        moduleId: 'm1',
        updates: [{ taskId: 't1', status: 'completed' }],
      }),
    ).rejects.toThrow('You must be signed in to update progress.');

    expect(applyTaskProgressUpdatesMock).not.toHaveBeenCalled();
  });

  it('revalidates module and plan paths on success', async () => {
    requestBoundaryActionMock.mockImplementationOnce(
      mockRequestBoundaryAction(makeActionTestScope()),
    );
    applyTaskProgressUpdatesMock.mockResolvedValueOnce({
      progress: [],
      revalidatePaths: ['/plans/p1/modules/m1', '/plans/p1', '/plans'],
      visibleState: { appliedByTaskId: { t1: 'completed' } },
    });

    await batchUpdateModuleTaskProgressAction({
      planId: 'p1',
      moduleId: 'm1',
      updates: [{ taskId: 't1', status: 'completed' }],
    });

    expect(applyTaskProgressUpdatesMock).toHaveBeenCalledWith({
      userId: 'user-1',
      planId: 'p1',
      moduleId: 'm1',
      updates: [{ taskId: 't1', status: 'completed' }],
      dbClient: actionTestDb,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith('/plans/p1/modules/m1');
    expect(revalidatePathMock).toHaveBeenCalledWith('/plans/p1');
    expect(revalidatePathMock).toHaveBeenCalledWith('/plans');
  });

  it('succeeds when persistence succeeds but revalidatePath throws', async () => {
    requestBoundaryActionMock.mockImplementationOnce(
      mockRequestBoundaryAction(makeActionTestScope()),
    );
    applyTaskProgressUpdatesMock.mockResolvedValueOnce({
      progress: [],
      revalidatePaths: ['/plans/p1/modules/m1', '/plans/p1', '/plans'],
      visibleState: { appliedByTaskId: {} },
    });
    revalidatePathMock.mockImplementation((path: string) => {
      if (path === '/plans/p1') {
        throw new Error('revalidate failed');
      }
    });

    await expect(
      batchUpdateModuleTaskProgressAction({
        planId: 'p1',
        moduleId: 'm1',
        updates: [{ taskId: 't1', status: 'completed' }],
      }),
    ).resolves.toBeUndefined();

    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/plans/p1' }),
      'Failed to revalidate path after mutation',
    );
  });

  it('maps boundary persistence errors to generic user message', async () => {
    requestBoundaryActionMock.mockImplementationOnce(
      mockRequestBoundaryAction(makeActionTestScope()),
    );
    const persistenceError = new Error('db exploded');
    applyTaskProgressUpdatesMock.mockRejectedValueOnce(persistenceError);

    await expect(
      batchUpdateModuleTaskProgressAction({
        planId: 'p1',
        moduleId: 'm1',
        updates: [{ taskId: 't1', status: 'completed' }],
      }),
    ).rejects.toThrow('Unable to update task progress right now.');

    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({
        taskIds: ['t1'],
        err: expect.objectContaining({ message: 'db exploded' }),
      }),
      'Failed to batch update module task progress',
    );
  });
});
