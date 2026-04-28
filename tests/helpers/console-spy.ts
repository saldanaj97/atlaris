import { type MockInstance, vi } from 'vitest';

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug';

/**
 * Spy on a `console` method with a typed `MockInstance`. Default impl is a
 * no-op so spied output doesn't leak into the test runner's stdout.
 *
 * Returns the spy plus a `restore()` helper that wraps `mockRestore()` for
 * use inside `afterEach`.
 */
export function spyOnConsole(method: ConsoleMethod): {
  spy: MockInstance<(typeof console)[ConsoleMethod]>;
  restore: () => void;
} {
  const spy = vi
    .spyOn(console, method)
    .mockImplementation(() => undefined) as MockInstance<
    (typeof console)[ConsoleMethod]
  >;
  return {
    spy,
    restore: () => {
      spy.mockRestore();
    },
  };
}
