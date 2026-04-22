import { describe, expect, it, vi } from 'vitest';
import type { PlanGenerationSessionEvent } from '@/features/plans/session/session-events';
import { consumePlanGenerationSseStream } from '@/features/plans/session/stream-reader';

const encoder = new TextEncoder();

function chunksToStream(parts: string[]): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			for (const part of parts) {
				controller.enqueue(encoder.encode(part));
			}
			controller.close();
		},
	});
}

describe('consumePlanGenerationSseStream', () => {
	it('emits events in chunk order and stops when shouldStop is true after an event', async () => {
		const types: PlanGenerationSessionEvent['type'][] = [];
		let terminal = false;

		const parseLine = (line: string): PlanGenerationSessionEvent | null => {
			const trimmed = line.trim();
			if (!trimmed.startsWith('data:')) return null;
			return JSON.parse(
				trimmed.slice('data:'.length).trim(),
			) as PlanGenerationSessionEvent;
		};

		await consumePlanGenerationSseStream({
			body: chunksToStream([
				'data: {"type":"plan_start","data":{"planId":"p1","attemptNumber":1,"topic":"t","skillLevel":"beginner","learningStyle":"mixed","weeklyHours":5,"startDate":null,"deadlineDate":null}}\n\n',
				'data: {"type":"error","data":{"planId":"p1","code":"E","message":"boom","classification":"validation","retryable":false}}\n\n',
				'data: {"type":"complete","data":{"planId":"p1","modulesCount":1,"tasksCount":1,"totalMinutes":1}}\n\n',
			]),
			parseLine,
			onEvent: (event) => {
				types.push(event.type);
				if (event.type === 'error') {
					terminal = true;
				}
			},
			shouldStop: () => terminal,
		});

		expect(types).toEqual(['plan_start', 'error']);
	});

	it('buffers split SSE lines across chunk boundaries', async () => {
		const types: PlanGenerationSessionEvent['type'][] = [];
		const line =
			'data: {"type":"plan_start","data":{"planId":"p2","attemptNumber":1,"topic":"t","skillLevel":"beginner","learningStyle":"mixed","weeklyHours":5,"startDate":null,"deadlineDate":null}}\n';
		const parseLine = (l: string): PlanGenerationSessionEvent | null => {
			const trimmed = l.trim();
			if (!trimmed.startsWith('data:')) return null;
			return JSON.parse(
				trimmed.slice('data:'.length).trim(),
			) as PlanGenerationSessionEvent;
		};

		await consumePlanGenerationSseStream({
			body: chunksToStream([line.slice(0, 20), line.slice(20), '\n\n']),
			parseLine,
			onEvent: (e) => types.push(e.type),
			shouldStop: () => false,
		});

		expect(types).toEqual(['plan_start']);
	});

	it('parses a trailing partial line when the stream closes', async () => {
		const types: PlanGenerationSessionEvent['type'][] = [];
		const payload =
			'{"type":"complete","data":{"planId":"p3","modulesCount":1,"tasksCount":1,"totalMinutes":1}}';
		const parseLine = (l: string): PlanGenerationSessionEvent | null => {
			const trimmed = l.trim();
			if (!trimmed.startsWith('data:')) return null;
			return JSON.parse(
				trimmed.slice('data:'.length).trim(),
			) as PlanGenerationSessionEvent;
		};

		await consumePlanGenerationSseStream({
			body: chunksToStream([`data: ${payload}`]),
			parseLine,
			onEvent: (e) => types.push(e.type),
			shouldStop: () => false,
		});

		expect(types).toEqual(['complete']);
	});

	it('delivers earlier events before a later read error rejects the stream', async () => {
		const parseLine = (line: string): PlanGenerationSessionEvent | null => {
			const trimmed = line.trim();
			if (!trimmed.startsWith('data:')) return null;
			return JSON.parse(
				trimmed.slice('data:'.length).trim(),
			) as PlanGenerationSessionEvent;
		};
		const boom = new Error('read failed');
		const onEvent = vi.fn();
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(
					encoder.encode(
						'data: {"type":"plan_start","data":{"planId":"p5","attemptNumber":1,"topic":"t","skillLevel":"beginner","learningStyle":"mixed","weeklyHours":5,"startDate":null,"deadlineDate":null}}\n\n',
					),
				);
			},
			pull() {
				throw boom;
			},
		});

		await expect(
			consumePlanGenerationSseStream({
				body,
				parseLine,
				onEvent,
				shouldStop: () => false,
			}),
		).rejects.toThrow('read failed');

		expect(onEvent).toHaveBeenCalledTimes(1);
		expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
			type: 'plan_start',
		});
	});

	it('calls onEvent for progress between plan_start and complete', async () => {
		const types: PlanGenerationSessionEvent['type'][] = [];
		const parseLine = (line: string): PlanGenerationSessionEvent | null => {
			const trimmed = line.trim();
			if (!trimmed.startsWith('data:')) return null;
			return JSON.parse(
				trimmed.slice('data:'.length).trim(),
			) as PlanGenerationSessionEvent;
		};

		await consumePlanGenerationSseStream({
			body: chunksToStream([
				'data: {"type":"plan_start","data":{"planId":"p4","attemptNumber":1,"topic":"t","skillLevel":"beginner","learningStyle":"mixed","weeklyHours":5,"startDate":null,"deadlineDate":null}}\n\n',
				'data: {"type":"progress","data":{"planId":"p4","modulesParsed":1,"modulesTotalHint":2,"percent":50}}\n\n',
				'data: {"type":"complete","data":{"planId":"p4","modulesCount":2,"tasksCount":4,"totalMinutes":100}}\n\n',
			]),
			parseLine,
			onEvent: (e) => types.push(e.type),
			shouldStop: () => false,
		});

		expect(types).toEqual(['plan_start', 'progress', 'complete']);
	});
});
