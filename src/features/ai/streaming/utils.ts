import { logger } from '@/lib/logging/logger';

export function toStream(obj: unknown): ReadableStream<string> {
	const data =
		typeof obj === 'string'
			? obj
			: obj === undefined
				? ''
				: (() => {
						const serialized = JSON.stringify(obj);
						return serialized === undefined ? '' : serialized;
					})();
	return new ReadableStream<string>({
		start(controller) {
			controller.enqueue(data);
			controller.close();
		},
	});
}

/** Non-string chunks are logged then thrown (parser expects strings only). */
export function readableStreamToAsyncIterable(
	stream: ReadableStream<string>,
): AsyncIterable<string> {
	return {
		async *[Symbol.asyncIterator]() {
			const reader = stream.getReader();
			let completed = false;
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						completed = true;
						return;
					}
					if (typeof value !== 'string') {
						logger.warn(
							{ chunkType: typeof value },
							'Invalid non-string chunk in AI stream; expected string',
						);
						throw new TypeError(`Expected string chunk, got ${typeof value}`);
					}
					yield value;
				}
			} finally {
				try {
					if (!completed) {
						await reader.cancel();
					}
				} finally {
					reader.releaseLock();
				}
			}
		},
	};
}

export function asyncIterableToReadableStream(
	iterable: AsyncIterable<string>,
): ReadableStream<string> {
	let cancelled = false;
	let pump: Promise<void> | null = null;

	return new ReadableStream<string>({
		start(controller) {
			pump = (async () => {
				try {
					for await (const chunk of iterable) {
						if (cancelled) {
							return;
						}
						controller.enqueue(chunk);
					}
					controller.close();
				} catch (error) {
					if (!cancelled) {
						controller.error(error);
					}
				}
			})();
		},
		async cancel() {
			cancelled = true;
			await pump;
		},
	});
}
