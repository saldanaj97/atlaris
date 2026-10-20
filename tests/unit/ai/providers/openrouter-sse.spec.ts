import {
  toByteStream,
  toSseBody,
  WEB_SEARCH_STREAM_CHUNKS,
} from './fixtures/openrouter-grounded-streams';
import { ProviderInvalidResponseError } from '@/features/ai/providers/errors';
import { parseSseJsonEvents } from '@/features/ai/providers/openrouter-sse';
import { describe, expect, it } from 'vitest';

async function collect(body: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const event of parseSseJsonEvents(body)) {
    events.push(event);
  }
  return events;
}

describe('parseSseJsonEvents', () => {
  it('yields every data event across split byte chunks and skips comments', async () => {
    const events = await collect(
      toByteStream(toSseBody(WEB_SEARCH_STREAM_CHUNKS), 7),
    );
    expect(events).toEqual(WEB_SEARCH_STREAM_CHUNKS);
  });

  it('stops at [DONE] and ignores anything after it', async () => {
    const events = await collect(
      toByteStream('data: {"a":1}\n\ndata: [DONE]\n\ndata: {"b":2}\n\n'),
    );
    expect(events).toEqual([{ a: 1 }]);
  });

  it('handles CRLF line endings and a final event without a blank line', async () => {
    const events = await collect(
      toByteStream('data: {"a":1}\r\n\r\ndata: {"b":2}', 3),
    );
    expect(events).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('throws an invalid-response error on a non-JSON event', async () => {
    await expect(collect(toByteStream('data: not-json\n\n'))).rejects.toThrow(
      ProviderInvalidResponseError,
    );
  });
});
