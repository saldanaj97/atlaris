import type { PdfContext } from '@/lib/pdf/context';

/**
 * Branded type for ISO 8601 date strings (YYYY-MM-DD).
 * Consumers must supply dates in this format.
 *
 * @example "2026-02-10"
 * @remarks Validate at input boundaries (e.g., with Zod) to enforce ISO format before passing to GenerationInput.
 */
export type IsoDateString = string & { readonly __brand: 'IsoDateString' };

export interface GenerationInput {
  topic: string;
  notes?: string | null;
  pdfContext?: PdfContext | null;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  weeklyHours: number;
  learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
  /** ISO 8601 date (YYYY-MM-DD). Consumers must supply valid ISO dates. @example "2026-02-10" */
  startDate?: string | null;
  /** ISO 8601 date (YYYY-MM-DD). Consumers must supply valid ISO dates. @example "2026-02-10" */
  deadlineDate?: string | null;
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
  stream: ReadableStream<string>;
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

/**
 * Configuration for micro-explanation generation (OpenRouter auth).
 * Providers that support micro-explanations may expose this via getMicroExplanationConfig.
 */
export interface MicroExplanationAuthConfig {
  apiKey: string;
  baseUrl: string;
  siteUrl?: string;
  appName?: string;
}

/**
 * Provider with optional micro-explanation config.
 * When present and returns a config with apiKey, generateMicroExplanation uses it for auth.
 * When absent or returns null/config without apiKey, generateMicroExplanation rejects before making API calls.
 */
export interface MicroExplanationConfigSupplier {
  getMicroExplanationConfig(): MicroExplanationAuthConfig | null;
}

export type ProviderErrorKind =
  | 'rate_limit'
  | 'timeout'
  | 'invalid_response'
  | 'unknown';
