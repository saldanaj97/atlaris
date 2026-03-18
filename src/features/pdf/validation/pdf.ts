import { z } from 'zod';
export type {
  ExtractionApiResponseData,
  ExtractionProofData,
  ExtractionSection,
  PdfPreviewEditInput,
  TruncationData,
} from './pdf.types';

import { TOPIC_MAX_LENGTH } from '@/shared/constants/learning-plans';
export {
  pdfExtractedSectionSchema,
  pdfPreviewEditSchema,
} from '@/shared/schemas/pdf-validation.schemas';
import { pdfExtractedSectionSchema } from '@/shared/schemas/pdf-validation.schemas';

export const pdfExtractionRequestSchema = z
  .object({
    fileName: z.string().trim().min(1).max(200),
    fileType: z.string().trim().min(1).max(200),
    sizeBytes: z.number().int().positive(),
  })
  .strict();

export const pdfExtractedContentSchema = z
  .object({
    mainTopic: z.string().trim().min(3).max(TOPIC_MAX_LENGTH),
    sections: z.array(pdfExtractedSectionSchema).min(1).max(50),
    confidence: z.enum(['high', 'medium', 'low']),
  })
  .strict();

type PdfUploadFile = {
  size: number;
  type: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

const isPdfUploadFile = (value: unknown): value is PdfUploadFile => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as {
    size?: unknown;
    type?: unknown;
    arrayBuffer?: unknown;
  };

  return (
    typeof candidate.size === 'number' &&
    Number.isFinite(candidate.size) &&
    typeof candidate.type === 'string' &&
    typeof candidate.arrayBuffer === 'function'
  );
};

export const pdfUploadFileSchema = z
  .custom<PdfUploadFile>(isPdfUploadFile, {
    message: 'A PDF file is required.',
  })
  .refine((file) => file.size > 0, 'PDF file is empty.')
  .refine(
    (file) => file.type === 'application/pdf',
    'Only PDF files are supported.'
  );

// Note: absolute size limits and PDF magic-bytes validation are enforced in
// `src/app/api/v1/plans/from-pdf/extract/route.ts` before extraction and scan.

export const pdfExtractionFormDataSchema = z
  .object({
    file: pdfUploadFileSchema,
  })
  .strict();

/* ─── Extraction API response schemas (client-side parsing) ─── */

/** Permissive section schema for API response parsing (no length constraints). */
export const extractionApiSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  level: z.number(),
  suggestedTopic: z.string().optional(),
});

export const truncationDataSchema = z.object({
  truncated: z.boolean(),
  maxBytes: z.number(),
  returnedBytes: z.number(),
  reasons: z.array(z.string()),
  limits: z.object({
    maxTextChars: z.number(),
    maxSections: z.number(),
    maxSectionChars: z.number(),
  }),
});

export const extractionProofSchema = z.object({
  token: z.string(),
  extractionHash: z.string(),
  expiresAt: z.string(),
  version: z.literal(1),
});

export const extractionApiResponseSchema = z.object({
  success: z.boolean(),
  extraction: z
    .object({
      pageCount: z.number(),
      structure: z.object({
        sections: z.array(extractionApiSectionSchema),
        suggestedMainTopic: z.string(),
        confidence: z.enum(['high', 'medium', 'low']),
      }),
      truncation: truncationDataSchema.optional(),
    })
    .optional(),
  proof: extractionProofSchema.optional(),
  error: z.string().optional(),
  code: z.string().optional(),
});
