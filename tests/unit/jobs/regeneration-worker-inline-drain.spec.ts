import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetInlineDrainStateForTesting,
  isInlineDrainFree,
  registerInlineDrain,
  tryRegisterInlineDrain,
  waitForInlineRegenerationDrains,
} from '@/features/jobs/regeneration-worker';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('inline regeneration drain tracking', () => {
  afterEach(async () => {
    await waitForInlineRegenerationDrains();
  });

  it('tryRegisterInlineDrain is false if another drain is already registered', () => {
    const a = deferred();
    expect(tryRegisterInlineDrain(() => a.promise)).toBe(true);
    expect(tryRegisterInlineDrain(() => Promise.resolve())).toBe(false);
    a.resolve();
  });

  it('isInlineDrainFree is true when no drains are in flight', () => {
    expect(isInlineDrainFree()).toBe(true);
  });

  it('_resetInlineDrainStateForTesting clears in-flight set so lock reopens', () => {
    const d = deferred();
    registerInlineDrain(d.promise);
    expect(isInlineDrainFree()).toBe(false);
    _resetInlineDrainStateForTesting();
    expect(isInlineDrainFree()).toBe(true);
    d.resolve();
  });

  it('isInlineDrainFree is false while a registered drain is pending, then true after wait', async () => {
    const { promise, resolve } = deferred();
    registerInlineDrain(promise);
    expect(isInlineDrainFree()).toBe(false);
    resolve();
    await waitForInlineRegenerationDrains();
    expect(isInlineDrainFree()).toBe(true);
  });

  it('waitForInlineRegenerationDrains resolves only after all registered drains settle', async () => {
    const a = deferred();
    const b = deferred();
    registerInlineDrain(a.promise);
    registerInlineDrain(b.promise);

    const order: string[] = [];
    const waiter = waitForInlineRegenerationDrains().then(() => {
      order.push('wait');
    });

    a.resolve();
    await Promise.resolve();
    order.push('after-a');
    expect(order).toEqual(['after-a']);

    b.resolve();
    await waiter;
    order.push('after-wait');
    expect(order).toEqual(['after-a', 'wait', 'after-wait']);
  });

  it('wait completes when the registered promise rejects', async () => {
    const { promise, reject } = deferred();
    registerInlineDrain(promise);
    queueMicrotask(() => {
      reject(new Error('boom'));
    });
    await expect(waitForInlineRegenerationDrains()).resolves.toBeUndefined();
    expect(isInlineDrainFree()).toBe(true);
  });

  it('drains registered after wait starts are awaited in later loop iterations', async () => {
    const first = deferred();
    registerInlineDrain(first.promise);

    const waitDone = waitForInlineRegenerationDrains();

    const second = deferred();
    registerInlineDrain(second.promise);

    first.resolve();
    await Promise.resolve();
    second.resolve();
    await waitDone;

    expect(isInlineDrainFree()).toBe(true);
  });

  it('waitForInlineRegenerationDrains throws when maxIterations exhausted', async () => {
    const d = deferred();
    registerInlineDrain(d.promise);
    try {
      await expect(waitForInlineRegenerationDrains(0)).rejects.toThrow(
        /exhausted/,
      );
    } finally {
      _resetInlineDrainStateForTesting();
      d.resolve();
    }
  });
});
