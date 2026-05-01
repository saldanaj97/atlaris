import { logger } from '@/lib/logging/logger';

/**
 * In-flight inline drain promises (same-process). Used as the lock: while non-empty, another inline
 * drain must not start. Production should use {@link tryRegisterInlineDrain} so the check and
 * registration happen in one synchronous step.
 */
const inlineInFlightDrains = new Set<Promise<void>>();

const DEFAULT_MAX_INLINE_DRAIN_WAIT_ITERATIONS = 1000;

/**
 * Predicate: true when the inline-drain set is empty (no drain in flight). Read-only; does not register.
 * Prefer {@link tryRegisterInlineDrain} for enqueue paths.
 */
export function isInlineDrainFree(): boolean {
  return inlineInFlightDrains.size === 0;
}

/**
 * If no inline drain is in flight, calls `getDrainPromise` and registers the returned promise
 * (same as {@link registerInlineDrain}). All happens synchronously, so check + register cannot
 * interleave with another caller. If a drain is already in flight, returns false and does not call
 * `getDrainPromise` (so a second `drain()` is not started).
 */
export function tryRegisterInlineDrain(
  getDrainPromise: () => Promise<void>,
): boolean {
  if (inlineInFlightDrains.size !== 0) {
    return false;
  }
  const promise = getDrainPromise();
  registerInlineDrain(promise);
  return true;
}

/**
 * Registers a drain promise so tests (or shutdown hooks) can await completion via
 * {@link waitForInlineRegenerationDrains}. Removes the promise from the set when it settles.
 */
export function registerInlineDrain(promise: Promise<void>): void {
  inlineInFlightDrains.add(promise);
  const cleanup = () => {
    inlineInFlightDrains.delete(promise);
  };
  void promise.then(cleanup, cleanup);
}

/**
 * Awaits all in-flight inline drains started in this process (e.g. between integration test files).
 * Runs in waves: after each {@link Promise.allSettled}, new drains may remain; loops until empty or
 * `maxIterations` is exceeded (then logs and throws).
 */
export async function waitForInlineRegenerationDrains(
  maxIterations: number = DEFAULT_MAX_INLINE_DRAIN_WAIT_ITERATIONS,
): Promise<void> {
  let iteration = 0;
  while (inlineInFlightDrains.size > 0) {
    if (iteration >= maxIterations) {
      const remaining = inlineInFlightDrains.size;
      logger.warn(
        { remainingDrains: remaining, maxIterations },
        'waitForInlineRegenerationDrains: max iterations exhausted',
      );
      throw new Error(
        `waitForInlineRegenerationDrains exhausted after ${maxIterations} iteration(s); ${remaining} drain(s) still in flight`,
      );
    }
    const snapshot = [...inlineInFlightDrains];
    await Promise.allSettled(snapshot);
    iteration++;
  }
}

/** Test-only. Clears tracked in-flight drains (e.g. stuck promises in unit tests). */
export function _resetInlineDrainStateForTesting(): void {
  inlineInFlightDrains.clear();
}
