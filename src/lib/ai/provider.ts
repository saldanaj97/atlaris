import type { ProviderErrorKind } from '@/lib/ai/types/provider.types';

// Backward-compatibility shim.
// New imports should use '@/lib/ai/types/provider.types' for types.
export type {
  AiPlanGenerationProvider,
  GenerationInput,
  GenerationOptions,
  IsoDateString,
  ProviderErrorKind,
  ProviderGenerateResult,
  ProviderMetadata,
  ProviderUsage,
} from '@/lib/ai/types/provider.types';

export interface ProviderErrorOptions extends ErrorOptions {
  statusCode?: number;
}

export class ProviderError extends Error {
  public readonly statusCode?: number;

  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    options?: ProviderErrorOptions
  ) {
    super(message, options);
    this.name = 'ProviderError';
    this.statusCode = options?.statusCode;
  }
}

export class ProviderNotImplementedError extends ProviderError {
  constructor(
    message = 'AI provider not implemented',
    options?: ProviderErrorOptions
  ) {
    super('unknown', message, options);
    this.name = 'ProviderNotImplementedError';
  }
}

export class ProviderRateLimitError extends ProviderError {
  constructor(
    message = 'AI provider rate limit exceeded',
    options?: ProviderErrorOptions
  ) {
    super('rate_limit', message, options);
    this.name = 'ProviderRateLimitError';
  }
}

export class ProviderTimeoutError extends ProviderError {
  constructor(
    message = 'AI provider timed out',
    options?: ProviderErrorOptions
  ) {
    super('timeout', message, options);
    this.name = 'ProviderTimeoutError';
  }
}

export class ProviderInvalidResponseError extends ProviderError {
  constructor(
    message = 'AI provider returned an invalid response',
    options?: ProviderErrorOptions
  ) {
    super('invalid_response', message, options);
    this.name = 'ProviderInvalidResponseError';
  }
}

// Re-export factory function from provider-factory module
export { getGenerationProvider } from '@/lib/ai/provider-factory';
