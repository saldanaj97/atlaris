import { describe, expect, it, vi } from 'vitest';

import { createGetAttemptCap } from '@/features/ai/generation-policy';
import {
	DEFAULT_ATTEMPT_CAP,
	resolveAttemptCap,
} from '@/shared/constants/generation';

describe('generation policy attempt-cap wiring', () => {
	it('delegates getAttemptCap to the injected reader', () => {
		const readAttemptCap = vi.fn(() => 7);
		const getAttemptCap = createGetAttemptCap(readAttemptCap);

		expect(getAttemptCap()).toBe(7);
		expect(readAttemptCap).toHaveBeenCalledTimes(1);
	});
});

describe('resolveAttemptCap', () => {
	it.each([
		{ rawCap: 0.5, expected: DEFAULT_ATTEMPT_CAP },
		{ rawCap: 2.9, expected: 2 },
		{ rawCap: Number.NaN, expected: DEFAULT_ATTEMPT_CAP },
		{ rawCap: -1, expected: DEFAULT_ATTEMPT_CAP },
		{ rawCap: 0, expected: DEFAULT_ATTEMPT_CAP },
		{ rawCap: 1, expected: 1 },
		{ rawCap: 3, expected: 3 },
	])('normalizes $rawCap to $expected', ({ rawCap, expected }) => {
		expect(resolveAttemptCap(rawCap)).toBe(expected);
	});
});
