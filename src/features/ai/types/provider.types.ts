import type {
  GenerationInput,
  ProviderMetadata,
} from '@/shared/types/ai-provider.types';
import type { PdfContext } from '@/shared/types/pdf-context.types';

export type {
  GenerationInput,
  IsoDateString,
  ProviderMetadata,
  ProviderUsage,
} from '@/shared/types/ai-provider.types';

export type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
export { IncompleteUsageError } from '@/shared/types/ai-usage.types';

export type { PdfContext };

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
