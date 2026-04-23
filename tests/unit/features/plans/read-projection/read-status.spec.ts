import { describe, expect, it } from 'vitest';
import { DEFAULT_ATTEMPT_CAP } from '@/features/ai/generation-policy';
import { derivePlanReadStatus } from '@/features/plans/read-projection/read-status';

describe('derivePlanReadStatus', () => {
	it('returns ready when modules exist even if status is generating', () => {
		expect(
			derivePlanReadStatus({
				generationStatus: 'generating',
				hasModules: true,
			}),
		).toBe('ready');
	});

	it('returns ready when generation status is ready without modules', () => {
		expect(
			derivePlanReadStatus({ generationStatus: 'ready', hasModules: false }),
		).toBe('ready');
	});

	it('returns pending when generation status is ready without modules and attempts are below cap', () => {
		expect(
			derivePlanReadStatus({
				generationStatus: 'ready',
				hasModules: false,
				attemptsCount: DEFAULT_ATTEMPT_CAP - 1,
				attemptCap: DEFAULT_ATTEMPT_CAP,
			}),
		).toBe('pending');
	});

	it('returns failed when generation status is ready without modules and attempts reached cap', () => {
		expect(
			derivePlanReadStatus({
				generationStatus: 'ready',
				hasModules: false,
				attemptsCount: DEFAULT_ATTEMPT_CAP,
				attemptCap: DEFAULT_ATTEMPT_CAP,
			}),
		).toBe('failed');
	});

	it('returns failed when generation status is failed', () => {
		expect(
			derivePlanReadStatus({ generationStatus: 'failed', hasModules: false }),
		).toBe('failed');
	});

	it('returns processing while generation is active and modules are absent', () => {
		expect(
			derivePlanReadStatus({
				generationStatus: 'generating',
				hasModules: false,
			}),
		).toBe('processing');
	});

	it('returns pending when ready plans are still below the retry cap', () => {
		expect(
			derivePlanReadStatus({
				generationStatus: 'ready',
				hasModules: false,
				attemptsCount: 1,
				attemptCap: DEFAULT_ATTEMPT_CAP,
			}),
		).toBe('pending');
	});
});
