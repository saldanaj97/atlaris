import { createId } from '@tests/fixtures/ids';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safeMarkPlanFailed } from '@/features/plans/session/stream-cleanup';

describe('stream-cleanup safeMarkPlanFailed', () => {
	const planId = createId('plan');
	const userId = createId('user');
	const loggerError = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('swallows persistence errors and logs', async () => {
		const err = new Error('db down');
		const persistence = {
			markGenerationFailure: vi.fn().mockRejectedValue(err),
			markGenerationSuccess: vi.fn(),
		};

		await expect(
			safeMarkPlanFailed(planId, userId, persistence, {
				logger: { error: loggerError },
			}),
		).resolves.toBeUndefined();

		expect(persistence.markGenerationFailure).toHaveBeenCalledWith(planId);
		expect(loggerError).toHaveBeenCalled();
	});

	it('does not log on success', async () => {
		const persistence = {
			markGenerationFailure: vi.fn().mockResolvedValue(undefined),
			markGenerationSuccess: vi.fn(),
		};

		await expect(
			safeMarkPlanFailed(planId, userId, persistence, {
				logger: { error: loggerError },
			}),
		).resolves.toBeUndefined();

		expect(persistence.markGenerationFailure).toHaveBeenCalledWith(planId);
		expect(loggerError).not.toHaveBeenCalled();
	});
});
