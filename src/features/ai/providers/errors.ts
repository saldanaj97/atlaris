import type { ProviderErrorKind } from '@/features/ai/types/provider.types';

type ProviderErrorOptions = ErrorOptions & {
	statusCode?: number;
};

export class ProviderError extends Error {
	public readonly statusCode?: number;

	constructor(
		public readonly kind: ProviderErrorKind,
		message: string,
		options?: ProviderErrorOptions,
	) {
		super(message, options);
		this.name = 'ProviderError';
		this.statusCode = options?.statusCode;
	}
}

export class ProviderRateLimitError extends ProviderError {
	constructor(
		message = 'AI provider rate limit exceeded',
		options?: ProviderErrorOptions,
	) {
		super('rate_limit', message, options);
		this.name = 'ProviderRateLimitError';
	}
}

export class ProviderTimeoutError extends ProviderError {
	constructor(
		message = 'AI provider timed out',
		options?: ProviderErrorOptions,
	) {
		super('timeout', message, options);
		this.name = 'ProviderTimeoutError';
	}
}

export class ProviderInvalidResponseError extends ProviderError {
	constructor(
		message = 'AI provider returned an invalid response',
		options?: ProviderErrorOptions,
	) {
		super('invalid_response', message, options);
		this.name = 'ProviderInvalidResponseError';
	}
}
