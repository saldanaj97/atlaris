import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAdaptiveTimeout } from '@/lib/ai/timeout';

const clock = () => Date.now();

describe('Adaptive timeout controller', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts after base duration when no module is detected', () => {
    vi.useFakeTimers();
    const controller = createAdaptiveTimeout({
      baseMs: 1_000,
      extensionMs: 1_000,
      extensionThresholdMs: 900,
      now: clock,
    });

    expect(controller.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(controller.signal.aborted).toBe(true);
    expect(controller.timedOut).toBe(true);
    controller.cancel();
  });

  it('extends timeout when a module arrives before the threshold', () => {
    vi.useFakeTimers();
    const controller = createAdaptiveTimeout({
      baseMs: 1_000,
      extensionMs: 1_000,
      extensionThresholdMs: 900,
      now: clock,
    });

    vi.advanceTimersByTime(400);
    controller.notifyFirstModule();
    expect(controller.didExtend).toBe(true);

    vi.advanceTimersByTime(1_199); // total 1,599ms
    expect(controller.signal.aborted).toBe(false);

    vi.advanceTimersByTime(401); // total 2,000ms
    expect(controller.signal.aborted).toBe(true);
    expect(controller.timedOut).toBe(true);
    controller.cancel();
  });

  it('does not extend when module detection occurs after threshold', () => {
    vi.useFakeTimers();
    const controller = createAdaptiveTimeout({
      baseMs: 1_000,
      extensionMs: 1_000,
      extensionThresholdMs: 900,
      now: clock,
    });

    vi.advanceTimersByTime(950);
    controller.notifyFirstModule();
    expect(controller.didExtend).toBe(false);

    vi.advanceTimersByTime(100);
    expect(controller.signal.aborted).toBe(true);
    expect(controller.timedOut).toBe(true);
    controller.cancel();
  });
});
