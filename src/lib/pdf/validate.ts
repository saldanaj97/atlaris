import type {
  PdfValidationInput,
  PdfValidationLimits,
  PdfValidationResult,
} from './types';

const PDF_MIME_TYPES = new Set(['application/pdf']);

/**
 * Validates a PDF file against size and page limits.
 *
 * @param input - PDF file details with mimeType (string), sizeBytes, pageCount, and optional text
 * @param limits - Validation limits (maxSizeBytes, maxPages)
 * @returns PdfValidationResult with success/error discriminant
 *
 * Returns { success: false, error: 'invalid_mime' } when mimeType is missing or not a string.
 */
export const validatePdfFile = (
  input: PdfValidationInput,
  limits: PdfValidationLimits
): PdfValidationResult => {
  if (
    !input.mimeType ||
    typeof input.mimeType !== 'string' ||
    input.mimeType.trim().length === 0
  ) {
    return {
      success: false,
      error: 'invalid_mime',
      message: 'Missing or invalid MIME type.',
    };
  }

  const mimeType = input.mimeType.toLowerCase();

  if (!PDF_MIME_TYPES.has(mimeType)) {
    return {
      success: false,
      error: 'invalid_mime',
      message: 'Only PDF files are supported.',
    };
  }

  if (input.sizeBytes > limits.maxSizeBytes) {
    return {
      success: false,
      error: 'too_large',
      message: 'PDF exceeds the maximum allowed size.',
    };
  }

  if (input.pageCount > limits.maxPages) {
    return {
      success: false,
      error: 'too_many_pages',
      message: 'PDF exceeds the maximum page count.',
    };
  }

  if (!input.text || input.text.trim().length === 0) {
    return {
      success: false,
      error: 'no_text',
      message: 'PDF does not contain extractable text.',
    };
  }

  return {
    success: true,
    sizeBytes: input.sizeBytes,
    pageCount: input.pageCount,
  };
};
