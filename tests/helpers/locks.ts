/**
 * Lock simulation helpers for testing concurrency dedupe
 * Simulates advisory lock behavior for getOrSetWithLock tests
 */

export interface Lock {
  acquired: boolean;
  release: () => void;
}

export class InMemoryLockManager {
  private locks: Map<string, Lock> = new Map();

  /**
   * Attempts to acquire a lock for the given key
   * Returns null if lock is already held
   */
  acquire(key: string): Lock | null {
    if (this.locks.has(key)) {
      return null; // Lock already held
    }

    const lock: Lock = {
      acquired: true,
      release: () => {
        this.locks.delete(key);
      },
    };

    this.locks.set(key, lock);
    return lock;
  }

  /**
   * Checks if a lock is currently held
   */
  isLocked(key: string): boolean {
    return this.locks.has(key);
  }

  /**
   * Releases all locks (cleanup helper)
   */
  releaseAll(): void {
    this.locks.clear();
  }

  /**
   * Gets count of active locks
   */
  getActiveLockCount(): number {
    return this.locks.size;
  }
}

/**
 * Creates a mock getOrSetWithLock implementation using in-memory locks
 * Useful for testing deduplication behavior
 */
export function createMockGetOrSetWithLock<T>(
  lockManager: InMemoryLockManager
) {
  const callCounts: Map<string, number> = new Map();
  const inFlightPromises: Map<string, Promise<T>> = new Map();

  return async (key: string, fetcher: () => Promise<T>): Promise<T> => {
    const lock = lockManager.acquire(key);

    if (!lock) {
      // Lock already held, wait briefly for other caller to finish
      await new Promise((resolve) => setTimeout(resolve, 10));
      // Wait for in-flight promise to exist, then return it
      while (!inFlightPromises.has(key)) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      return inFlightPromises.get(key)!;
    }

    try {
      const count = callCounts.get(key) || 0;
      callCounts.set(key, count + 1);
      // Create fetcher promise and store it in the map
      const fetcherPromise = fetcher();
      inFlightPromises.set(key, fetcherPromise);
      // Await the promise
      const result = await fetcherPromise;
      return result;
    } finally {
      // Clean up promise from map and release lock
      // (callers with a reference can still await the promise)
      inFlightPromises.delete(key);
      lock.release();
    }
  };
}

/**
 * Creates instrumentation counter for asserting upstream calls
 */
export class CallCounter {
  private counts: Map<string, number> = new Map();

  increment(key: string): void {
    const current = this.counts.get(key) || 0;
    this.counts.set(key, current + 1);
  }

  getCount(key: string): number {
    return this.counts.get(key) || 0;
  }

  reset(): void {
    this.counts.clear();
  }

  getAllCounts(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }
}
