export function createAbortError(message = 'Operation aborted.'): DOMException {
  return new DOMException(message, 'AbortError');
}

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
    } catch {}
  };
}
