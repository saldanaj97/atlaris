export interface GenerationInput {
  topic: string;
  notes?: string | null;
  skillLevel: string;
  weeklyHours: number;
  learningStyle: string;
}

export interface ProviderUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ProviderMetadata {
  model?: string;
  provider?: string;
  usage?: ProviderUsage;
}

export interface ProviderGenerateResult {
  stream: AsyncIterable<string>;
  metadata: ProviderMetadata;
}

export interface GenerationOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface AiPlanGenerationProvider {
  generate(
    input: GenerationInput,
    options?: GenerationOptions
  ): Promise<ProviderGenerateResult>;
}

export type ProviderErrorKind =
  | 'rate_limit'
  | 'timeout'
  | 'invalid_response'
  | 'unknown';

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
