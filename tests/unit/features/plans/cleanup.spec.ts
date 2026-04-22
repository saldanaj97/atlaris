import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
	cleanupOrphanedAttempts,
	cleanupStuckPlans,
	ORPHANED_ATTEMPT_THRESHOLD_MS,
	STUCK_PLAN_THRESHOLD_MS,
} from '@/features/plans/cleanup';
import type { DbClient } from '@/lib/db/types';

// Mock the logger to avoid console noise and allow assertion
vi.mock('@/lib/logging/logger', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

function createMockDbClient(resultCount: number) {
	const rows = Array.from({ length: resultCount }, (_, i) => ({
		id: `id-${i}`,
	}));
	const forFn = vi.fn().mockResolvedValue(rows);
	const limitFn = vi.fn().mockReturnValue({ for: forFn });
	const whereSelectFn = vi.fn().mockReturnValue({ limit: limitFn });
	const transactionFn = vi.fn();
	const fromFn = vi.fn().mockReturnValue({ where: whereSelectFn });
	const selectFn = vi.fn().mockReturnValue({ from: fromFn });
	const returningFn = vi.fn().mockResolvedValue(rows);
	const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
	const setFn = vi.fn().mockReturnValue({ where: whereFn });
	const updateFn = vi.fn().mockReturnValue({ set: setFn });

	// NOTE: keeps a bespoke chainable Drizzle stub instead of tests/fixtures/db-mocks.ts#makeDbClient because this test asserts transaction plus select().from().where().limit().for() behavior via the chain.
	const client = {
		select: selectFn,
		update: updateFn,
		transaction: transactionFn,
	} as unknown as DbClient;

	transactionFn.mockImplementation(
		async (callback: (tx: DbClient) => unknown) => callback(client),
	);

	return {
		client,
		spies: {
			selectFn,
			fromFn,
			whereSelectFn,
			limitFn,
			forFn,
			updateFn,
			setFn,
			whereFn,
			returningFn,
			transactionFn,
		},
	};
}

describe('cleanupStuckPlans', () => {
	let mockDb: ReturnType<typeof createMockDbClient>;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('marks stuck generating plans as failed and returns count', async () => {
		mockDb = createMockDbClient(3);
		const markFailure = vi.fn().mockResolvedValue(undefined);

		const result = await cleanupStuckPlans(mockDb.client, undefined, {
			markFailure,
		});

		expect(result.cleaned).toBe(3);
		expect(mockDb.spies.transactionFn).toHaveBeenCalledTimes(1);
		expect(markFailure).toHaveBeenCalledTimes(3);
		expect(markFailure).toHaveBeenNthCalledWith(
			1,
			'id-0',
			mockDb.client,
			expect.any(Function),
		);

		const firstClock = markFailure.mock.calls[0]?.[2] as
			| (() => Date)
			| undefined;
		const secondClock = markFailure.mock.calls[1]?.[2] as
			| (() => Date)
			| undefined;

		expect(firstClock).toBeDefined();
		expect(secondClock).toBeDefined();
		expect(firstClock?.()).toBeInstanceOf(Date);
		expect(secondClock?.()).toBe(firstClock?.());
	});

	it('returns 0 when no stuck plans exist', async () => {
		mockDb = createMockDbClient(0);

		const result = await cleanupStuckPlans(mockDb.client);

		expect(result.cleaned).toBe(0);
	});

	it('has a reasonable stuck plan threshold', () => {
		const fiveMinutes = 5 * 60 * 1000;
		const sixtyMinutes = 60 * 60 * 1000;
		expect(STUCK_PLAN_THRESHOLD_MS).toBeGreaterThanOrEqual(fiveMinutes);
		expect(STUCK_PLAN_THRESHOLD_MS).toBeLessThanOrEqual(sixtyMinutes);
	});

	it('accepts a custom threshold', async () => {
		mockDb = createMockDbClient(1);
		const customThreshold = 5 * 60 * 1000; // 5 minutes

		const result = await cleanupStuckPlans(mockDb.client, customThreshold);

		expect(result.cleaned).toBe(1);
	});
});

describe('cleanupOrphanedAttempts', () => {
	let mockDb: ReturnType<typeof createMockDbClient>;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('finalizes orphaned in_progress attempts and returns count', async () => {
		mockDb = createMockDbClient(5);

		const result = await cleanupOrphanedAttempts(mockDb.client);

		expect(result.cleaned).toBe(5);
		expect(mockDb.spies.updateFn).toHaveBeenCalledTimes(1);
		expect(mockDb.spies.setFn).toHaveBeenCalledWith(
			expect.objectContaining({
				classification: 'timeout',
			}),
		);
	});

	it('returns 0 when no orphaned attempts exist', async () => {
		mockDb = createMockDbClient(0);

		const result = await cleanupOrphanedAttempts(mockDb.client);

		expect(result.cleaned).toBe(0);
	});

	it('has a reasonable orphaned attempt threshold', () => {
		const fiveMinutes = 5 * 60 * 1000;
		const sixtyMinutes = 60 * 60 * 1000;
		expect(ORPHANED_ATTEMPT_THRESHOLD_MS).toBeGreaterThanOrEqual(fiveMinutes);
		expect(ORPHANED_ATTEMPT_THRESHOLD_MS).toBeLessThanOrEqual(sixtyMinutes);
	});

	it('accepts a custom threshold', async () => {
		mockDb = createMockDbClient(2);
		const customThreshold = 30 * 60 * 1000; // 30 minutes

		const result = await cleanupOrphanedAttempts(
			mockDb.client,
			customThreshold,
		);

		expect(result.cleaned).toBe(2);
	});
});
