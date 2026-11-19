import {
  DEFAULT_ATTEMPT_CAP,
  resolveAttemptCap,
} from '@/shared/constants/generation';
import { describe, expect, it } from 'vitest';

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
