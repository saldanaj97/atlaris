import type { PdfContext } from '@/shared/types/pdf-context.types';

export type GenerationInput = {
  topic: string;
  notes?: string | null;
  pdfContext?: PdfContext | null;
  pdfExtractionHash?: string;
  pdfProofVersion?: 1;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  weeklyHours: number;
  learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
  startDate?: string | null;
  deadlineDate?: string | null;
};

export type ProviderUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /**
   * OpenRouter `usage.cost` when present (USD, not credits). Parsed from the
   * final streaming chunk or non-streaming `response.usage` — see
   * `openrouter-response.ts` and `src/features/ai/openrouter-cost-contract.ts`.
   */
  providerReportedCostUsd?: number | null;
};

export type ProviderMetadata = {
  model?: string;
  provider?: string;
  usage?: ProviderUsage;
};
