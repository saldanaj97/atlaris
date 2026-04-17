import type { infer as ZodInfer } from 'zod';
import type { pdfPreviewEditSchema } from '@/shared/schemas/pdf-validation.schemas';
import type {
  extractionApiResponseSchema,
  extractionApiSectionSchema,
  extractionProofSchema,
  truncationDataSchema,
} from './pdf.schemas';

export type PdfPreviewEditInput = ZodInfer<typeof pdfPreviewEditSchema>;

export type ExtractionApiResponseData = ZodInfer<
  typeof extractionApiResponseSchema
>;

export type ExtractionSection = ZodInfer<typeof extractionApiSectionSchema>;

export type TruncationData = ZodInfer<typeof truncationDataSchema>;

export type ExtractionProofData = ZodInfer<typeof extractionProofSchema>;
