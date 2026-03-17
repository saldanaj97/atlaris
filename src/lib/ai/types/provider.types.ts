import type { PdfContext } from '@/lib/pdf/context.types';

/**
 * Branded type for ISO 8601 date strings (YYYY-MM-DD).
 * Consumers must supply dates in this format.
 *
 * @example "2026-02-10"
 * @remarks Validate at input boundaries (e.g., with Zod) to enforce ISO format before passing to GenerationInput.
 */
export type IsoDateString = string & { readonly __brand: 'IsoDateString' };

export type GenerationInput = {
  topic: string;
  notes?: string | null;
  pdfContext?: PdfContext | null;
  pdfExtractionHash?: string;
  pdfProofVersion?: 1;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  weeklyHours: number;
  learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
  /** ISO 8601 date (YYYY-MM-DD). Consumers must supply valid ISO dates. @example "2026-02-10" */
  startDate?: string | null;
  /** ISO 8601 date (YYYY-MM-DD). Consumers must supply valid ISO dates. @example "2026-02-10" */
  deadlineDate?: string | null;
};

export type ProviderUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type ProviderMetadata = {
  model?: string;
  provider?: string;
  usage?: ProviderUsage;
};

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
