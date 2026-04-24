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

	it('logs and swallows typical persistence failures', async () => {
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
		expect(loggerError).toHaveBeenCalledWith(
			expect.objectContaining({ userId }),
			expect.any(String),
		);
	});

	it('rethrows TypeError so wiring bugs surface', async () => {
		const err = new TypeError('read property of undefined');
		const persistence = {
			markGenerationFailure: vi.fn().mockRejectedValue(err),
			markGenerationSuccess: vi.fn(),
		};

		await expect(
			safeMarkPlanFailed(planId, userId, persistence, {
				logger: { error: loggerError },
			}),
		).rejects.toBe(err);

		expect(loggerError).not.toHaveBeenCalled();
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
