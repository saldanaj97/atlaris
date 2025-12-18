export interface GenerationInput {
  topic: string;
  notes?: string | null;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  weeklyHours: number;
  learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
  startDate?: string | null;
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
