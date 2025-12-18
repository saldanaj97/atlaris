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

/**
 * Reads a streaming response and parses SSE events into an array.
 * @param response - The Response object with a streaming body
 * @returns Array of parsed streaming events
 */
export async function readStreamingResponse(
  response: Response
): Promise<StreamingEvent[]> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  if (!reader) {
    throw new Error('Expected streaming response body');
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }

  // Split events by blank lines (supports \r\n\r\n and \n\n)
  const rawEvents = buffer
    .split(/\r?\n\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const events: StreamingEvent[] = [];

  for (const raw of rawEvents) {
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

    if (dataLines.length === 0) continue;

    const dataPayload = dataLines.join('\n').trim();

    try {
      const parsed = JSON.parse(dataPayload);
      events.push({
        type: typeof parsed?.type === 'string' ? parsed.type : eventType,
        data: parsed,
      });
    } catch {
      // ignore unparsable event
    }
  }

  return events;
}
