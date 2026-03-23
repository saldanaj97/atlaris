import type { z } from 'zod';

import { StreamingEventSchema } from '@/features/ai/streaming/schema';
import type { StreamingEvent } from '@/features/ai/types/streaming.types';

export type ParseSsePlanEventHandlers = {
  onValidationFailed: (ctx: { issues: z.ZodIssue[]; payload: string }) => void;
  onJsonError?: (ctx: { error: unknown; payload: string }) => void;
};

/**
 * Parses one SSE line into a validated streaming event, or null.
 */
export function parseSsePlanEventLine(
  line: string,
  handlers: ParseSsePlanEventHandlers
): StreamingEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const payload = trimmed.startsWith('data:')
    ? trimmed.slice('data:'.length).trim()
    : trimmed;
  if (!payload) return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    const result = StreamingEventSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    handlers.onValidationFailed({
      issues: result.error.issues,
      payload,
    });
    return null;
  } catch (error) {
    handlers.onJsonError?.({ error, payload });
    return null;
  }
}
