import { afterEach, describe, expect, it } from 'vitest';
import {
  registerInlineDrain,
  tryAcquireInlineDrainLock,
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

  it('tryAcquireInlineDrainLock is true when no drains are in flight', () => {
    expect(tryAcquireInlineDrainLock()).toBe(true);
  });

  it('tryAcquireInlineDrainLock is false while a registered drain is pending, then true after wait', async () => {
    const { promise, resolve } = deferred();
    registerInlineDrain(promise);
    expect(tryAcquireInlineDrainLock()).toBe(false);
    resolve();
    await waitForInlineRegenerationDrains();
    expect(tryAcquireInlineDrainLock()).toBe(true);
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

  it('wait completes when the registered promise matches production (reject absorbed by .catch)', async () => {
    const { promise, reject } = deferred();
    // Mirrors regenerate route: register after .catch so the wait set never holds a bare
    // rejecting promise (which would be an unhandled rejection in Node/Vitest).
    const caught = promise.catch(() => undefined);
    registerInlineDrain(caught);
    const wait = waitForInlineRegenerationDrains();
    queueMicrotask(() => {
      reject(new Error('boom'));
    });
    await expect(wait).resolves.toBeUndefined();
    expect(tryAcquireInlineDrainLock()).toBe(true);
  });

  it('drains registered after wait starts are awaited via recursion', async () => {
    const first = deferred();
    registerInlineDrain(first.promise);

    const waitDone = waitForInlineRegenerationDrains();

    const second = deferred();
    registerInlineDrain(second.promise);

    first.resolve();
    await Promise.resolve();
    second.resolve();
    await waitDone;

    expect(tryAcquireInlineDrainLock()).toBe(true);
  });
});
