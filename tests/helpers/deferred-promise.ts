interface DeferredPromise<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason?: Error) => void;
}

export function createDeferredPromise<T>(): DeferredPromise<T> {
	let resolvePromise: ((value: T | PromiseLike<T>) => void) | undefined;
	let rejectPromise: ((reason?: Error) => void) | undefined;

	const promise = new Promise<T>((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});

	return {
		promise,
		resolve: (value: T) => {
			if (resolvePromise === undefined) {
				throw new Error('Failed to create deferred promise');
			}

			resolvePromise(value);
		},
		reject: (reason?: Error) => {
			if (rejectPromise === undefined) {
				throw new Error('Failed to create deferred promise');
			}

			rejectPromise(reason);
		},
	};
}
