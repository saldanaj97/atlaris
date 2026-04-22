import type { z } from 'zod';

import { StreamingEventSchema } from '@/features/ai/streaming/schema';
import type { StreamingEvent } from '@/features/plans/session/session-events';

export type ParseSsePlanEventHandlers = {
	onValidationFailed: (ctx: { issues: z.ZodIssue[]; payload: string }) => void;
	onJsonError?: (ctx: { error: unknown; payload: string }) => void;
};

const isIgnorableSseLine = (trimmed: string): boolean =>
	trimmed.startsWith(':') ||
	trimmed.startsWith('event:') ||
	trimmed.startsWith('id:') ||
	trimmed.startsWith('retry:');

/**
 * Parses one SSE line into a validated streaming event, or null.
 *
 * **Wire contract:** each event is a single `data:` line whose payload is one JSON
 * object (see `createEventStream` / plan session emitters). Multi-line SSE `data:`
 * continuations (multiple `data:` lines merged into one message) are not supported;
 * split/join would need to live in the reader if that changes.
 */
export function parseSsePlanEventLine(
	line: string,
	handlers: ParseSsePlanEventHandlers,
): StreamingEvent | null {
	const trimmed = line.trim();
	if (!trimmed || isIgnorableSseLine(trimmed)) return null;
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
