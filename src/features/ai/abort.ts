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
 * attached, and
 * a cleanup function is returned that removes that listener. Call the cleanup
 * when the listener is no longer needed to avoid leaks.
 *
 * Works with both DOM and Node AbortSignal implementations (e.g. from
 * AbortController, fetch, or Node's events).
 *
 * @param signal - The AbortSignal to listen to (DOM or Node).
 * @param listener - Callback invoked when the signal is or becomes aborted.
 * @returns A cleanup function that removes the attached "abort" listener. Safe
 *   to call multiple times; no-op if the signal was already aborted.
 */
export function attachAbortListener(
  signal: AbortSignal,
  listener: () => void,
): () => void {
  if (signal.aborted) {
    listener();
    return () => {};
  }

  const handler: EventListener = () => listener();
  signal.addEventListener('abort', handler);
  return () => {
    try {
      signal.removeEventListener('abort', handler);
    } catch {
      // Ignore cleanup failures.
    }
  };
}
