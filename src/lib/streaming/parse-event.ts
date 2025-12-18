import type { StreamingEvent } from '@/lib/ai/streaming/types';

/**
 * Parse a single SSE data line into a StreamingEvent if it contains JSON with a `type` field.
 * Returns null if the line is empty, not JSON, or doesn't include a `type` property.
 */
export const parseEventLine = (line: string): StreamingEvent | null => {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const payload = trimmed.startsWith('data:')
    ? trimmed.slice('data:'.length).trim()
    : trimmed;
  if (!payload) return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    if (typeof parsed === 'object' && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.type === 'string') {
        return parsed as StreamingEvent;
      }
    }
    return null;
  } catch {
    return null;
  }
};
