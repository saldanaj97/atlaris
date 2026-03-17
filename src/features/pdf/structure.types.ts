import type { ExtractedStructure } from '@/features/pdf/types';

export type ExtractionResponseCapConfig = {
  maxBytes: number;
  maxTextChars: number;
  maxSections: number;
  maxSectionChars: number;
  maxSectionTitleChars: number;
  maxSuggestedTopicChars: number;
};

export type ExtractionResponsePayload = {
  text: string;
  pageCount: number;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
  };
  structure: ExtractedStructure;
};

export type ExtractionTruncationMetadata = {
  truncated: boolean;
  maxBytes: number;
  returnedBytes: number;
  hardResetApplied: boolean;
  hardResetBytesBeforeReset?: number;
  reasons: string[];
  limits: {
    maxTextChars: number;
    maxSections: number;
    maxSectionChars: number;
  };
};

export type CapExtractionResponse = {
  payload: ExtractionResponsePayload;
  truncation: ExtractionTruncationMetadata;
};
