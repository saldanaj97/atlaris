/**
 * Creates a standard DOMException for aborted operations. Use this instead of
 * plain Error with name 'AbortError' so that instanceof DOMException and
 * native AbortController behavior work correctly downstream.
 */
export function createAbortError(message = 'Operation aborted.'): DOMException {
  return new DOMException(message, 'AbortError');
}

/**
 * Attaches a one-shot listener for the given AbortSignal's abort event.
 *
 * If the signal is already aborted, the listener is invoked synchronously and
 * a no-op cleanup is returned. Otherwise, an "abort" event listener is
 * attached (via addEventListener when available, or onabort as fallback), and
 * a cleanup function is returned that removes that listener. Call the cleanup
 * when the listener is no longer needed to avoid leaks.
 *
 * Cross-environment: works with both DOM and Node AbortSignal implementations
 * (e.g. from AbortController, fetch, or Node's events). Prefers addEventListener
 * when present; falls back to onabort for minimal signal-like objects.
 *
 * @param signal - The AbortSignal to listen to (DOM or Node).
 * @param listener - Callback invoked when the signal is or becomes aborted.
 * @returns A cleanup function that removes the attached "abort" listener. Safe
 *   to call multiple times; no-op if the signal was already aborted.
 */
export function attachAbortListener(
  signal: AbortSignal,
  listener: () => void
): () => void {
  if (signal.aborted) {
    listener();
    return () => {};
  }

  if (
    'addEventListener' in signal &&
    typeof signal.addEventListener === 'function'
  ) {
    const handler: EventListener = () => listener();
    signal.addEventListener('abort', handler);
    return () => {
      try {
        signal.removeEventListener?.('abort', handler);
      } catch {
        // Ignore cleanup failures.
      }
    };
  }

  // Property-based handler (signal.onabort) limitation: if other code sets
  // signal.onabort after we attach our wrapper, the returned cleanup (which
  // does signal.onabort = previous ?? null) will overwrite that later setter
  // and remove their handler. Symbols: previous (saved before we set
  // signal.onabort), listener (our callback), and the returned cleanup. Do
  // not "fix" by restoring previous without considering concurrent setters;
  // prefer addEventListener/removeEventListener where available.
  if ('onabort' in signal) {
    const previous = signal.onabort;
    signal.onabort = function (this: AbortSignal, ev: Event) {
      try {
        if (typeof previous === 'function') {
          previous.call(this, ev);
        }
      } finally {
        listener();
      }
    };

    return () => {
      signal.onabort = previous ?? null;
    };
  }

  return () => {};
}
