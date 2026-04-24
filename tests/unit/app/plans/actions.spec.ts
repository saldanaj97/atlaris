import { afterEach, describe, expect, it, vi } from 'vitest';

const {
	revalidatePathMock,
	requestBoundaryActionMock,
	applyTaskProgressUpdatesMock,
	getPlanDetailForReadMock,
	loggerMock,
} = vi.hoisted(() => ({
	revalidatePathMock: vi.fn(),
	requestBoundaryActionMock: vi.fn(),
	applyTaskProgressUpdatesMock: vi.fn(),
	getPlanDetailForReadMock: vi.fn(),
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

vi.mock('@/features/plans/task-progress', async () => {
	const actual = await vi.importActual<
		typeof import('@/features/plans/task-progress')
	>('@/features/plans/task-progress');
	return {
		...actual,
		applyTaskProgressUpdates: applyTaskProgressUpdatesMock,
	};
});

vi.mock('@/features/plans/read-projection', () => ({
	getPlanDetailForRead: getPlanDetailForReadMock,
}));

vi.mock('@/lib/logging/logger', () => ({
	logger: loggerMock,
}));

import { makeDbClient } from '@tests/fixtures/db-mocks';
import { batchUpdateTaskProgressAction } from '@/app/plans/[id]/actions';
import type { RequestScope } from '@/lib/api/request-boundary';
import type { DbUser } from '@/lib/db/queries/types/users.types';

const actionTestDb = makeDbClient();
const actionTestActor = { id: 'user-1' } as DbUser;

function makeActionTestScope(): RequestScope {
	return {
		actor: actionTestActor,
		db: actionTestDb,
		owned: { userId: actionTestActor.id, dbClient: actionTestDb },
		correlationId: 'test-correlation-id',
	};
}

describe('batchUpdateTaskProgressAction', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('checks auth before validating oversized update batches', async () => {
		requestBoundaryActionMock.mockResolvedValueOnce(null);
		const oversizedUpdates = Array.from({ length: 501 }, (_, index) => ({
			taskId: `task-${index}`,
			status: 'completed' as const,
		}));

		await expect(
			batchUpdateTaskProgressAction({
				planId: 'plan-123',
				updates: oversizedUpdates,
			}),
		).rejects.toThrow('You must be signed in to update progress.');

		expect(requestBoundaryActionMock).toHaveBeenCalledOnce();
		expect(applyTaskProgressUpdatesMock).not.toHaveBeenCalled();
		expect(revalidatePathMock).not.toHaveBeenCalled();
	});

	it('rejects oversized update batches after auth', async () => {
		requestBoundaryActionMock.mockImplementationOnce(
			async (fn: (scope: RequestScope) => Promise<void>) =>
				fn(makeActionTestScope()),
		);
		const oversizedUpdates = Array.from({ length: 501 }, (_, index) => ({
			taskId: `task-${index}`,
			status: 'completed' as const,
		}));

		await expect(
			batchUpdateTaskProgressAction({
				planId: 'plan-123',
				updates: oversizedUpdates,
			}),
		).rejects.toThrow(
			'Batch update limit exceeded: received 501 updates, but the maximum allowed is 500.',
		);

		expect(applyTaskProgressUpdatesMock).not.toHaveBeenCalled();
		expect(revalidatePathMock).not.toHaveBeenCalled();
	});

	it('throws when unauthenticated', async () => {
		requestBoundaryActionMock.mockResolvedValueOnce(null);

		await expect(
			batchUpdateTaskProgressAction({
				planId: 'plan-123',
				updates: [{ taskId: 't1', status: 'completed' }],
			}),
		).rejects.toThrow('You must be signed in to update progress.');

		expect(applyTaskProgressUpdatesMock).not.toHaveBeenCalled();
	});

	it('revalidates paths returned by the boundary on success', async () => {
		requestBoundaryActionMock.mockImplementationOnce(
			async (fn: (scope: RequestScope) => Promise<void>) =>
				fn(makeActionTestScope()),
		);
		applyTaskProgressUpdatesMock.mockResolvedValueOnce({
			progress: [],
			revalidatePaths: ['/plans/plan-123', '/plans'],
			visibleState: { appliedByTaskId: {} },
		});

		await batchUpdateTaskProgressAction({
			planId: 'plan-123',
			updates: [{ taskId: 't1', status: 'in_progress' }],
		});

		expect(applyTaskProgressUpdatesMock).toHaveBeenCalledWith({
			userId: 'user-1',
			planId: 'plan-123',
			updates: [{ taskId: 't1', status: 'in_progress' }],
			dbClient: actionTestDb,
		});
		expect(revalidatePathMock).toHaveBeenCalledWith('/plans/plan-123');
		expect(revalidatePathMock).toHaveBeenCalledWith('/plans');
	});

	it('maps boundary persistence errors to generic user message', async () => {
		requestBoundaryActionMock.mockImplementationOnce(
			async (fn: (scope: RequestScope) => Promise<void>) =>
				fn(makeActionTestScope()),
		);
		const persistenceError = new Error('db exploded');
		applyTaskProgressUpdatesMock.mockRejectedValueOnce(persistenceError);

		await expect(
			batchUpdateTaskProgressAction({
				planId: 'plan-123',
				updates: [{ taskId: 't1', status: 'completed' }],
			}),
		).rejects.toThrow('Unable to update task progress right now.');

		expect(loggerMock.error).toHaveBeenCalledWith(
			expect.objectContaining({ err: persistenceError }),
			'Failed to batch update task progress',
		);
	});
});
