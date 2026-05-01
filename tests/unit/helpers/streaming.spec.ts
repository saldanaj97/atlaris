import { describe, expect, it } from 'vitest';

import { readStreamingResponse } from '@tests/helpers/streaming';

function responseFromSseChunks(chunks: string[]): Response {
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(new TextEncoder().encode(chunks[offset]));
      offset += 1;
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('readStreamingResponse', () => {
  it('parses CRLF-delimited blocks and event: lines', async () => {
    const res = responseFromSseChunks([
      'event: progress\r\ndata: {"type":"progress","data":{"pct":1}}\r\n\r\n',
    ]);
    const events = await readStreamingResponse(res);
    expect(events).toEqual([{ type: 'progress', data: { pct: 1 } }]);
  });

  it('parses multiple SSE blocks in one chunk', async () => {
    const res = responseFromSseChunks([
      'data: {"type":"a","n":1}\n\ndata: {"type":"b","n":2}\n\n',
    ]);
    const events = await readStreamingResponse(res);
    expect(events).toEqual([
      { type: 'a', data: { type: 'a', n: 1 } },
      { type: 'b', data: { type: 'b', n: 2 } },
    ]);
  });

  it('uses JSON type when present over event: default', async () => {
    const res = responseFromSseChunks([
      'event: message\ndata: {"type":"final","ok":true}\n\n',
    ]);
    const events = await readStreamingResponse(res);
    expect(events[0].type).toBe('final');
    expect(events[0].data).toEqual({ type: 'final', ok: true });
  });

  it('uses event name when JSON has no type field', async () => {
    const res = responseFromSseChunks([
      'event: done\ndata: {"status":"ok"}\n\n',
    ]);
    const events = await readStreamingResponse(res);
    expect(events[0].type).toBe('done');
    expect(events[0].data).toEqual({ status: 'ok' });
  });

  it('drops unparsable JSON data lines', async () => {
    const res = responseFromSseChunks([
      'data: not-json\n\n',
      'data: {"type":"ok"}\n\n',
    ]);
    const events = await readStreamingResponse(res);
    expect(events).toEqual([{ type: 'ok', data: { type: 'ok' } }]);
  });

  it('throws when body has no reader', async () => {
    await expect(readStreamingResponse(new Response())).rejects.toThrow(
      'Expected streaming response body',
    );
  });
});
