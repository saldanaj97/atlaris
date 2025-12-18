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

  return buffer
    .split('\n')
    .map((line) => line.replace(/^data:\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean) as StreamingEvent[];
}
