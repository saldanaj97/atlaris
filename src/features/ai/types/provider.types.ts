import type {
  GenerationInput,
  ProviderMetadata,
} from '@/shared/types/ai-provider.types';

export type {
  GenerationInput,
  ProviderMetadata,
  ProviderUsage,
} from '@/shared/types/ai-provider.types';

export type ProviderGenerateResult = {
  stream: ReadableStream<string>;
  metadata: ProviderMetadata;
};

export type GenerationOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type AiPlanGenerationProvider = {
  generate(
    input: GenerationInput,
    options?: GenerationOptions
  ): Promise<ProviderGenerateResult>;
};

export type ProviderErrorKind =
  | 'rate_limit'
  | 'timeout'
  | 'invalid_response'
  | 'provider_error';
