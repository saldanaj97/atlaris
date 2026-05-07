import type { PlanGenerationSessionEvent } from '@/features/plans/session/session-events';

type StreamReaderOptions = {
  body: ReadableStream<Uint8Array>;
  parseLine: (line: string) => PlanGenerationSessionEvent | null;
  onEvent: (event: PlanGenerationSessionEvent) => void;
  shouldStop: () => boolean;
};

type LineDispatchOptions = Pick<
  StreamReaderOptions,
  'parseLine' | 'onEvent' | 'shouldStop'
>;

function processLineAndShouldStop(line: string, options: LineDispatchOptions) {
  const event = options.parseLine(line);
  if (!event) {
    return false;
  }

  options.onEvent(event);
  return options.shouldStop();
}

function appendDecoderRemainder(decoder: TextDecoder, buffer: string) {
  const remaining = decoder.decode();
  return remaining ? buffer + remaining : buffer;
}

function normalizeStreamError(error: unknown) {
  return error instanceof Error
    ? error
    : new Error('Plan generation stream failed.');
}

function cancelReaderAfterError(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  error: unknown,
) {
  try {
    void reader
      .cancel(error instanceof Error ? error : undefined)
      .catch(() => undefined);
  } catch {
    // Ignore cancellation failures so the original read error still propagates.
  }
}

/**
 * Reads an SSE response body: chunk decode, line boundaries, per-line parse,
 * event dispatch, and early cancel when `shouldStop` is true after an event.
 * Does not interpret terminal semantics — callers own resolve/reject and UI state.
 *
 * **Line contract:** `parseLine` is invoked once per `\n`-delimited line. Pair with
 * {@link parseSsePlanEventLine} so each non-empty line is one full JSON event payload.
 */
export async function consumePlanGenerationSseStream(
  options: StreamReaderOptions,
): Promise<void> {
  const { body, parseLine, onEvent, shouldStop } = options;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer = appendDecoderRemainder(decoder, buffer);
        if (buffer.trim()) {
          processLineAndShouldStop(buffer, { parseLine, onEvent, shouldStop });
          buffer = '';
        }
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (
          processLineAndShouldStop(line, { parseLine, onEvent, shouldStop })
        ) {
          await reader.cancel();
          return;
        }
      }
    }
  } catch (error) {
    cancelReaderAfterError(reader, error);
    throw normalizeStreamError(error);
  }
}
