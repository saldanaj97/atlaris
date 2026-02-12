/**
 * Converts an object to a single-chunk ReadableStream<string>.
 * This keeps provider contracts aligned on native web streams.
 */
export function toStream(obj: unknown): ReadableStream<string> {
  const data = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return new ReadableStream<string>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

/**
 * Converts a ReadableStream<string> to AsyncIterable<string> for parser compatibility.
 */
export function readableStreamToAsyncIterable(
  stream: ReadableStream<string>
): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            return;
          }
          if (typeof value === 'string') {
            yield value;
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}

/**
 * Converts async text chunks into a native ReadableStream<string>.
 */
export function asyncIterableToReadableStream(
  iterable: AsyncIterable<string>
): ReadableStream<string> {
  const iterator = iterable[Symbol.asyncIterator]();

  return new ReadableStream<string>({
    async pull(controller) {
      const { done, value } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      if (typeof value === 'string') {
        controller.enqueue(value);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}
