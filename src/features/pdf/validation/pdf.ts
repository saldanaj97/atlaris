import { z } from 'zod';
import { TOPIC_MAX_LENGTH } from '@/shared/constants/learning-plans';
import { pdfExtractedSectionSchema } from '@/shared/schemas/pdf-validation.schemas';

export {
  pdfExtractedSectionSchema,
  pdfPreviewEditSchema,
} from '@/shared/schemas/pdf-validation.schemas';
export {
  extractionApiResponseSchema,
  extractionApiSectionSchema,
  extractionProofSchema,
  truncationDataSchema,
} from './pdf.schemas';
export type {
  ExtractionApiResponseData,
  ExtractionProofData,
  ExtractionSection,
  PdfPreviewEditInput,
  TruncationData,
} from './pdf.types';

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
  // Require an explicit PDF MIME here; the extract route still validates
  // PDF magic bytes later to catch mislabeled payloads.
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
