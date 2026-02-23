import {
  acquireGlobalPdfExtractionSlot,
  checkPdfExtractionThrottle,
  checkPdfSizeLimit,
  type GlobalExtractionState,
  validatePdfUpload,
  withGlobalPdfSlot,
} from '@/lib/api/pdf-rate-limit';
import { describe, expect, it, vi } from 'vitest';

describe('PDF DoS hardening (Task 4 - Phase 2)', () => {
  describe('Extraction throttling', () => {
    it('allows first extraction', () => {
      const mockStore = new Map<string, number[]>();
      const result = checkPdfExtractionThrottle('user-123', {
        store: mockStore,
      });

      expect(result.allowed).toBe(true);
      expect(result.retryAfterMs).toBeUndefined();
    });

    it('allows up to 10 extractions in window', () => {
      const userId = 'user-456';
      const mockStore = new Map<string, number[]>();

      // Make 10 extractions
      for (let i = 0; i < 10; i++) {
        const result = checkPdfExtractionThrottle(userId, { store: mockStore });
        expect(result.allowed).toBe(true);
      }

      // 11th should be blocked
      const result = checkPdfExtractionThrottle(userId, { store: mockStore });
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    it('isolates throttling per user', () => {
      const user1 = 'user-aaa';
      const user2 = 'user-bbb';
      const mockStore = new Map<string, number[]>();

      // Max out user1
      for (let i = 0; i < 10; i++) {
        checkPdfExtractionThrottle(user1, { store: mockStore });
      }

      // User1 should be blocked
      expect(
        checkPdfExtractionThrottle(user1, { store: mockStore }).allowed
      ).toBe(false);

      // User2 should still be allowed
      expect(
        checkPdfExtractionThrottle(user2, { store: mockStore }).allowed
      ).toBe(true);
    });

    it('expires entries after the 10-minute window', () => {
      const userId = 'user-window-test';
      const mockStore = new Map<string, number[]>();
      let now = 1_700_000_000_000;

      for (let i = 0; i < 10; i++) {
        const result = checkPdfExtractionThrottle(userId, {
          store: mockStore,
          now: () => now,
        });
        expect(result.allowed).toBe(true);
      }

      const blocked = checkPdfExtractionThrottle(userId, {
        store: mockStore,
        now: () => now,
      });
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterMs).toBeGreaterThan(0);

      now += 10 * 60 * 1000 + 1;
      const allowedAgain = checkPdfExtractionThrottle(userId, {
        store: mockStore,
        now: () => now,
      });
      expect(allowedAgain.allowed).toBe(true);
      expect(allowedAgain.retryAfterMs).toBeUndefined();
    });

    it('decreases retryAfterMs as time advances', () => {
      const userId = 'user-retry-test';
      const mockStore = new Map<string, number[]>();
      let now = 1_700_000_000_000;

      // Fill the window
      for (let i = 0; i < 10; i++) {
        checkPdfExtractionThrottle(userId, {
          store: mockStore,
          now: () => now,
        });
      }

      const blocked = checkPdfExtractionThrottle(userId, {
        store: mockStore,
        now: () => now,
      });
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterMs).toBeLessThanOrEqual(10 * 60 * 1000);
      expect(blocked.retryAfterMs).toBeGreaterThan(0);

      now += 5 * 60 * 1000;
      const partiallyExpired = checkPdfExtractionThrottle(userId, {
        store: mockStore,
        now: () => now,
      });
      expect(partiallyExpired.allowed).toBe(false);
      expect(partiallyExpired.retryAfterMs).toBeGreaterThan(0);
      expect(partiallyExpired.retryAfterMs).toBeLessThan(
        blocked.retryAfterMs ?? Infinity
      );
    });

    it('cannot bypass user-based throttle with spoofed IP headers', () => {
      const userId = 'user-spoof-test';
      const mockStore = new Map<string, number[]>();

      for (let i = 0; i < 10; i++) {
        checkPdfExtractionThrottle(userId, { store: mockStore });
      }

      const blocked = checkPdfExtractionThrottle(userId, {
        store: mockStore,
        headers: {
          'x-forwarded-for': '1.2.3.4',
          'x-real-ip': '1.2.3.4',
        },
      });
      expect(blocked.allowed).toBe(false);
    });
  });

  describe('Global extraction concurrency', () => {
    const createTracker = (): GlobalExtractionState => ({ inFlight: 0 });

    it('blocks when global extraction slots are exhausted', () => {
      const tracker = createTracker();
      const acquired: Array<{ release: () => void }> = [];
      let blocked: ReturnType<typeof acquireGlobalPdfExtractionSlot> | null =
        null;

      while (blocked === null) {
        const slot = acquireGlobalPdfExtractionSlot({ state: tracker });
        if (!slot.allowed) {
          blocked = slot;
          break;
        }
        acquired.push(slot);
      }

      expect(acquired.length).toBeGreaterThan(0);
      if (!blocked) {
        throw new Error('Expected final slot to be blocked');
      }
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterMs).toBeGreaterThan(0);

      for (const slot of acquired) {
        slot.release();
      }
    });

    it('releases slot idempotently and allows next extraction', () => {
      const tracker = createTracker();

      const slot = acquireGlobalPdfExtractionSlot({ state: tracker });
      expect(slot.allowed).toBe(true);
      if (!slot.allowed) {
        throw new Error('Expected slot to be allowed');
      }

      slot.release();
      slot.release();

      const next = acquireGlobalPdfExtractionSlot({ state: tracker });
      expect(next.allowed).toBe(true);
      if (!next.allowed) {
        throw new Error('Expected next slot to be allowed');
      }
      next.release();
      next.release();
    });

    it('automatically reclaims leaked slots after lease timeout', () => {
      const tracker = createTracker();
      let leaseCallback: (() => void) | null = null;
      const fakeSetTimeout = (
        callback: () => void
      ): ReturnType<typeof setTimeout> => {
        leaseCallback = callback;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      };
      const fakeClearTimeout = vi.fn(
        (_id: ReturnType<typeof setTimeout>): void => {
          // no-op; lease timer is cleared on release
        }
      );
      const slot = acquireGlobalPdfExtractionSlot({
        state: tracker,
        leaseMs: 5,
        setTimeoutFn: fakeSetTimeout as typeof setTimeout,
        clearTimeoutFn: fakeClearTimeout as unknown as typeof clearTimeout,
      });
      expect(slot.allowed).toBe(true);
      if (!slot.allowed) {
        throw new Error('Expected slot to be allowed');
      }
      expect(tracker.inFlight).toBe(1);

      expect(leaseCallback).toBeTypeOf('function');
      const runLeaseCallback: () => void = leaseCallback ?? (() => {});
      runLeaseCallback();
      expect(tracker.inFlight).toBe(0);

      slot.release();
      expect(tracker.inFlight).toBe(0);
      expect(fakeClearTimeout).toHaveBeenCalledTimes(1);
    });

    it('withGlobalPdfSlot always releases the slot in finally', async () => {
      expect.assertions(3);
      const tracker = createTracker();

      await expect(
        withGlobalPdfSlot(
          async () => {
            expect(tracker.inFlight).toBe(1);
            throw new Error('boom');
          },
          { state: tracker }
        )
      ).rejects.toThrow('boom');

      expect(tracker.inFlight).toBe(0);
    });
  });

  describe('Size limit validation', () => {
    it('allows files at exact tier limit (size === maxPdfSizeMb)', async () => {
      const probe = await checkPdfSizeLimit('user-123', 1, {
        resolveTier: async () => 'free',
      });
      const maxPdfSizeMb = probe.limits.maxPdfSizeMb;
      const sizeAtLimit = maxPdfSizeMb * 1024 * 1024;

      const result = await checkPdfSizeLimit('user-123', sizeAtLimit, {
        resolveTier: async () => 'free',
      });

      expect(result.allowed).toBe(true);
      expect(result.limits.maxPdfSizeMb).toBe(maxPdfSizeMb);
    });

    it('rejects files one MB over tier limit (size === maxPdfSizeMb + 1)', async () => {
      const probe = await checkPdfSizeLimit('user-123', 1, {
        resolveTier: async () => 'free',
      });
      const maxPdfSizeMb = probe.limits.maxPdfSizeMb;
      const sizeOverLimit = (maxPdfSizeMb + 1) * 1024 * 1024;

      const result = await checkPdfSizeLimit('user-123', sizeOverLimit, {
        resolveTier: async () => 'free',
      });

      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.code).toBe('FILE_TOO_LARGE');
      }
    });

    it('rejects oversized files', async () => {
      const result = await checkPdfSizeLimit('user-123', 100 * 1024 * 1024, {
        resolveTier: async () => 'free',
      });

      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.code).toBe('FILE_TOO_LARGE');
        expect(result.reason).toContain('MB');
      }
    });

    it('enforces different limits per tier', async () => {
      const largeFile = 15 * 1024 * 1024; // 15MB

      const freeResult = await checkPdfSizeLimit('user-free', largeFile, {
        resolveTier: async () => 'free',
      });

      const proResult = await checkPdfSizeLimit('user-pro', largeFile, {
        resolveTier: async () => 'pro',
      });

      expect(freeResult.allowed).toBe(false);
      expect(proResult.allowed).toBe(true);
    });
  });

  describe('Page count validation', () => {
    it('validates both size and page count', async () => {
      const result = await validatePdfUpload('user-123', 5 * 1024 * 1024, 50, {
        resolveTier: async () => 'free',
      });

      expect(result.allowed).toBe(true);
    });

    it('rejects excessive page counts', async () => {
      const result = await validatePdfUpload(
        'user-123',
        5 * 1024 * 1024,
        10000,
        {
          resolveTier: async () => 'free',
        }
      );

      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.code).toBe('TOO_MANY_PAGES');
        expect(result.reason).toContain('page');
      }
    });

    it('rejects negative values', async () => {
      await expect(() =>
        validatePdfUpload('user-123', -100, 10, {
          resolveTier: async () => 'free',
        })
      ).rejects.toThrow('positive');
    });

    it('rejects negative page count', async () => {
      await expect(() =>
        validatePdfUpload('user-123', 1024, -10, {
          resolveTier: async () => 'free',
        })
      ).rejects.toThrow('positive');
    });

    it('rejects zero values', async () => {
      await expect(() =>
        validatePdfUpload('user-123', 0, 0, {
          resolveTier: async () => 'free',
        })
      ).rejects.toThrow('positive');
    });

    it('handles combined violations (size + pages)', async () => {
      const result = await validatePdfUpload(
        'user-123',
        100 * 1024 * 1024,
        10000,
        {
          resolveTier: async () => 'free',
        }
      );

      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(['FILE_TOO_LARGE', 'TOO_MANY_PAGES']).toContain(result.code);
      }
    });
  });
});
