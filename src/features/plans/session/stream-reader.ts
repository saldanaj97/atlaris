import type { PlanGenerationSessionEvent } from '@/features/plans/session/session-events';

/**
 * Reads an SSE response body: chunk decode, line boundaries, per-line parse,
 * event dispatch, and early cancel when `shouldStop` is true after an event.
 * Does not interpret terminal semantics — callers own resolve/reject and UI state.
 *
 * **Line contract:** `parseLine` is invoked once per `\n`-delimited line. Pair with
 * {@link parseSsePlanEventLine} so each non-empty line is one full JSON event payload.
 */
export async function consumePlanGenerationSseStream(options: {
	body: ReadableStream<Uint8Array>;
	parseLine: (line: string) => PlanGenerationSessionEvent | null;
	onEvent: (event: PlanGenerationSessionEvent) => void;
	shouldStop: () => boolean;
}): Promise<void> {
	const { body, parseLine, onEvent, shouldStop } = options;
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				const remaining = decoder.decode();
				if (remaining) {
					buffer += remaining;
				}
				if (buffer.trim()) {
					const event = parseLine(buffer);
					if (event) {
						onEvent(event);
					}
					buffer = '';
				}
				return;
			}

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				const event = parseLine(line);
				if (event) {
					onEvent(event);
					if (shouldStop()) {
						await reader.cancel();
						return;
					}
				}
			}
		}
	} catch (error) {
		try {
			void reader
				.cancel(error instanceof Error ? error : undefined)
				.catch(() => undefined);
		} catch {
			// Ignore cancellation failures so the original read error still propagates.
		}
		throw error instanceof Error
			? error
			: new Error('Plan generation stream failed.');
	}
}
