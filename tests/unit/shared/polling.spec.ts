import {
  BACKOFF_MULTIPLIER,
  computeNextDelay,
  INITIAL_POLL_MS,
  JITTER_FACTOR,
  MAX_POLL_MS,
} from '@/shared/constants/polling';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('computeNextDelay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('multiplies the current delay by the backoff multiplier', () => {
    // Remove jitter for deterministic assertion
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = computeNextDelay(INITIAL_POLL_MS);
    expect(result).toBe(INITIAL_POLL_MS * BACKOFF_MULTIPLIER);
  });

  it('caps result at MAX_POLL_MS', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const result = computeNextDelay(MAX_POLL_MS);
    expect(result).toBe(MAX_POLL_MS);
  });

  it('never returns below INITIAL_POLL_MS', () => {
    // Force jitter to produce the lowest possible value
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = computeNextDelay(INITIAL_POLL_MS);
    expect(result).toBeGreaterThanOrEqual(INITIAL_POLL_MS);
  });

  it('never returns above MAX_POLL_MS', () => {
    // Force jitter to produce the highest possible value
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const result = computeNextDelay(MAX_POLL_MS);
    expect(result).toBeLessThanOrEqual(MAX_POLL_MS);
  });

  it('applies jitter within ±JITTER_FACTOR bounds', () => {
    const base = 2000;
    const expected = base * BACKOFF_MULTIPLIER;

    // Low jitter
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const low = computeNextDelay(base);
    expect(low).toBeGreaterThanOrEqual(expected * (1 - JITTER_FACTOR));

    // High jitter
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const high = computeNextDelay(base);
    expect(high).toBeLessThanOrEqual(expected * (1 + JITTER_FACTOR));
  });

  it('produces different values with different random seeds', () => {
    const results = new Set<number>();
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      vi.spyOn(Math, 'random').mockReturnValue(r);
      results.add(computeNextDelay(2000));
      vi.restoreAllMocks();
    }
    expect(results.size).toBeGreaterThan(1);
  });
});
