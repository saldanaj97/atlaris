/**
 * Shared streaming response utilities for tests.
 *
 * This module provides helpers for parsing Server-Sent Events (SSE)
 * streaming responses in integration tests.
 */

/**
 * Type for parsed streaming events
 */
export type StreamingEvent = {
  type: string;
  data?: Record<string, unknown>;
};

export function findStreamingEvent(
  events: StreamingEvent[],
  type: string,
): StreamingEvent | undefined {
  return events.find((event) => event.type === type);
}

/** Read until done or throw; swallow read errors so callers can parse buffered SSE. */
async function readStreamBodyIntoBuffer(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
    }
  } catch {
    // Stream may error (e.g., on generation failure) - continue to parse
    // any events that were successfully read before the error
  }

  return buffer;
}

/** Split SSE message blocks (blank-line delimited). */
function splitRawSseMessageBlocks(buffer: string): string[] {
  return buffer
    .split(/\r?\n\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse one SSE block into StreamingEvent, or null if no usable data. */
function tryParseSseMessageBlock(raw: string): StreamingEvent | null {
  let eventType = 'message';
  const dataLines: string[] = [];
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventType = line.replace(/^event:\s*/, '').trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.replace(/^data:\s*/, ''));
    } else if (line.startsWith('id:')) {
      // ignore id for now
    } else {
      // fallback: treat as data line
      if (line.trim()) dataLines.push(line.trim());
    }
  }

  if (dataLines.length === 0) return null;

  const dataPayload = dataLines.join('\n').trim();

  try {
    const parsed = JSON.parse(dataPayload) as {
      type?: unknown;
      data?: unknown;
    };
    return {
      type: typeof parsed?.type === 'string' ? parsed.type : eventType,
      data: (parsed?.data ?? parsed) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

function parseSseBufferToEvents(buffer: string): StreamingEvent[] {
  const rawEvents = splitRawSseMessageBlocks(buffer);
  const events: StreamingEvent[] = [];

  for (const raw of rawEvents) {
    const parsed = tryParseSseMessageBlock(raw);
    if (parsed) {
      events.push(parsed);
    }
  }

  return events;
}

/**
 * Reads a streaming response and parses SSE events into an array.
 * @param response - The Response object with a streaming body
 * @returns Array of parsed streaming events
 */
export async function readStreamingResponse(
  response: Response,
): Promise<StreamingEvent[]> {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error('Expected streaming response body');
  }

  const buffer = await readStreamBodyIntoBuffer(reader);
  return parseSseBufferToEvents(buffer);
}
