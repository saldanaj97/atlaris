import { z } from 'zod';

export { pdfPreviewEditSchema } from '@/shared/schemas/pdf-validation.schemas';
export { extractionApiResponseSchema } from './pdf.schemas';

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
