import type { infer as ZodInfer } from 'zod';

type PdfModule = typeof import('./pdf');

export type PdfPreviewEditInput = ZodInfer<PdfModule['pdfPreviewEditSchema']>;

export type ExtractionApiResponseData = ZodInfer<
  PdfModule['extractionApiResponseSchema']
>;

export type ExtractionSection = ZodInfer<
  PdfModule['extractionApiSectionSchema']
>;

export type TruncationData = ZodInfer<PdfModule['truncationDataSchema']>;

export type ExtractionProofData = ZodInfer<PdfModule['extractionProofSchema']>;
