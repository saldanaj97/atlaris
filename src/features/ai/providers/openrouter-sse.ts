import { ProviderInvalidResponseError } from '@/features/ai/providers/errors';

const DONE_SENTINEL = '[DONE]';

function parseEventData(rawEvent: string): string | undefined {
  const dataLines: string[] = [];
  for (const line of rawEvent.split('\n')) {
    // Lines starting with ':' are comments (OpenRouter's keep-alive pings).
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(line.startsWith('data: ') ? 6 : 5));
    }
  }
  return dataLines.length > 0 ? dataLines.join('\n') : undefined;
}

/**
 * Parses an OpenAI-style server-sent event stream into JSON chunks, stopping
 * at `data: [DONE]`.
 */
export async function* parseSseJsonEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      if (done) {
        // Terminate a final event the server sent without a blank line.
        buffer += '\n\n';
      }

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = parseEventData(rawEvent);
        if (data === DONE_SENTINEL) {
          finished = true;
          return;
        }
        if (data !== undefined) {
          try {
            yield JSON.parse(data) as unknown;
          } catch (error) {
            throw new ProviderInvalidResponseError(
              'OpenRouter stream sent an event that is not JSON',
              { cause: error },
            );
          }
        }
        boundary = buffer.indexOf('\n\n');
      }

      if (done) {
        finished = true;
        return;
      }
    }
  } finally {
    if (!finished) {
      // Best-effort: the consumer stopped early or parsing failed.
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}
