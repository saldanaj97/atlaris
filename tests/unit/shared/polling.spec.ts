import { describe, expect, it } from 'vitest';
import {
  BACKOFF_MULTIPLIER,
  computeNextDelay,
  INITIAL_POLL_MS,
  JITTER_FACTOR,
  MAX_POLL_MS,
} from '@/shared/constants/polling';

describe('computeNextDelay', () => {
  it('multiplies the current delay by the backoff multiplier', () => {
    const result = computeNextDelay(INITIAL_POLL_MS, () => 0.5);
    expect(result).toBe(INITIAL_POLL_MS * BACKOFF_MULTIPLIER);
  });

  it('caps result at MAX_POLL_MS', () => {
    const result = computeNextDelay(MAX_POLL_MS, () => 0.5);
    expect(result).toBe(MAX_POLL_MS);
  });

  it('never returns below INITIAL_POLL_MS', () => {
    // Force jitter to produce the lowest possible value
    const result = computeNextDelay(INITIAL_POLL_MS, () => 0);
    expect(result).toBeGreaterThanOrEqual(INITIAL_POLL_MS);
  });

  it('never returns above MAX_POLL_MS', () => {
    // Force jitter to produce the highest possible value
    const result = computeNextDelay(MAX_POLL_MS, () => 1);
    expect(result).toBeLessThanOrEqual(MAX_POLL_MS);
  });

  it('applies jitter within ±JITTER_FACTOR bounds', () => {
    const base = 2000;
    const expected = base * BACKOFF_MULTIPLIER;

    const low = computeNextDelay(base, () => 0);
    expect(low).toBeGreaterThanOrEqual(expected * (1 - JITTER_FACTOR));

    const high = computeNextDelay(base, () => 1);
    expect(high).toBeLessThanOrEqual(expected * (1 + JITTER_FACTOR));
  });

  it.each([
    NaN,
    Infinity,
    -Infinity,
    -1,
    0,
  ])('returns INITIAL_POLL_MS for invalid input: %s', (input) => {
    expect(computeNextDelay(input)).toBe(INITIAL_POLL_MS);
  });

  it('produces different values with different random seeds', () => {
    const results = new Set<number>();
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      results.add(computeNextDelay(2000, () => r));
    }
    expect(results.size).toBeGreaterThan(1);
  });
});
