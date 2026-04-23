import { afterEach, describe, expect, it, vi } from 'vitest';

const {
	revalidatePathMock,
	requestBoundaryActionMock,
	setTaskProgressBatchMock,
	getPlanDetailForReadMock,
	loggerMock,
} = vi.hoisted(() => ({
	revalidatePathMock: vi.fn(),
	requestBoundaryActionMock: vi.fn(),
	setTaskProgressBatchMock: vi.fn(),
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

vi.mock('@/app/plans/[id]/server/task-progress-action-deps', () => ({
	PROGRESS_STATUSES: ['todo', 'in-progress', 'completed'],
	logger: loggerMock,
	setTaskProgressBatch: setTaskProgressBatchMock,
}));

vi.mock('@/features/plans/read-projection', () => ({
	getPlanDetailForRead: getPlanDetailForReadMock,
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
			}),
		).rejects.toThrow(
			'Batch update limit exceeded: received 501 updates, but the maximum allowed is 500.',
		);

		expect(requestBoundaryActionMock).not.toHaveBeenCalled();
		expect(setTaskProgressBatchMock).not.toHaveBeenCalled();
		expect(revalidatePathMock).not.toHaveBeenCalled();
	});
});
