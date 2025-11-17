/**
 * Converts an object to an async iterable stream for consistency with AI SDK patterns.
 * This is used by AI providers to create a stream from generated plan objects.
 */
export function toStream(obj: unknown): AsyncIterable<string> {
  const data = JSON.stringify(obj);
  return {
    [Symbol.asyncIterator](): AsyncIterator<string> {
      let done = false;
      return {
        next(): Promise<IteratorResult<string>> {
          if (done) return Promise.resolve({ done: true, value: undefined });
          done = true;
          return Promise.resolve({ done: false, value: data });
        },
      };
    },
  } as AsyncIterable<string>;
}
