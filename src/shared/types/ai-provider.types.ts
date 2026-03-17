import type { PdfContext } from '@/shared/types/pdf-context.types';

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
  startDate?: string | null;
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
