import type { ProviderErrorKind } from './types/provider.types';

// Re-export types from provider.types for backwards compatibility
export type {
  AiPlanGenerationProvider,
  GenerationInput,
  GenerationOptions,
  IsoDateString,
  ProviderErrorKind,
  ProviderGenerateResult,
  ProviderMetadata,
  ProviderUsage,
} from './types/provider.types';

export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'ProviderError';
  }
}

export class ProviderNotImplementedError extends ProviderError {
  constructor(message = 'AI provider not implemented') {
    super('unknown', message);
    this.name = 'ProviderNotImplementedError';
  }
}

export class ProviderRateLimitError extends ProviderError {
  constructor(message = 'AI provider rate limit exceeded') {
    super('rate_limit', message);
    this.name = 'ProviderRateLimitError';
  }
}

export class ProviderTimeoutError extends ProviderError {
  constructor(message = 'AI provider timed out') {
    super('timeout', message);
    this.name = 'ProviderTimeoutError';
  }
}

export class ProviderInvalidResponseError extends ProviderError {
  constructor(message = 'AI provider returned an invalid response') {
    super('invalid_response', message);
    this.name = 'ProviderInvalidResponseError';
  }
}

// Re-export factory function from provider-factory module
export { getGenerationProvider } from './provider-factory';
