import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { checkPdfSizeLimit, validatePdfUpload } from '@/lib/api/pdf-rate-limit';
import { json } from '@/lib/api/response';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { extractTextFromPdf } from '@/lib/pdf/extract';

export type PdfErrorCode =
  | 'FILE_TOO_LARGE'
  | 'TOO_MANY_PAGES'
  | 'NO_TEXT'
  | 'INVALID_FILE'
  | 'QUOTA_EXCEEDED';

const errorResponse = (message: string, code: PdfErrorCode, status: number) =>
  json({ success: false, error: message, code }, { status });

const toExtractionError = (message: string, status = 400) =>
  errorResponse(message, 'INVALID_FILE', status);

export const POST = withErrorBoundary(
  withAuthAndRateLimit('aiGeneration', async ({ req, userId }) => {
    const user = await getUserByClerkId(userId);
    if (!user) {
      throw new Error(
        'Authenticated user record missing despite provisioning.'
      );
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return toExtractionError('PDF file is required.');
    }

    if (file.size === 0) {
      return toExtractionError('PDF file is empty.');
    }

    if (!file.type || file.type !== 'application/pdf') {
      return toExtractionError('Only PDF files are supported.', 415);
    }

    const sizeCheck = await checkPdfSizeLimit(user.id, file.size);
    if (!sizeCheck.allowed) {
      return errorResponse(sizeCheck.reason, sizeCheck.code, 413);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extraction = await extractTextFromPdf(buffer);

    if (!extraction.success) {
      if (extraction.error === 'no_text') {
        return errorResponse(extraction.message, 'NO_TEXT', 400);
      }

      return toExtractionError(extraction.message);
    }

    const tierValidation = await validatePdfUpload(
      user.id,
      file.size,
      extraction.pageCount
    );

    if (!tierValidation.allowed) {
      const status = tierValidation.code === 'FILE_TOO_LARGE' ? 413 : 400;
      return errorResponse(tierValidation.reason, tierValidation.code, status);
    }

    return json({
      success: true,
      extraction: {
        text: extraction.text,
        pageCount: extraction.pageCount,
        metadata: extraction.metadata,
        structure: extraction.structure,
      },
    });
  })
);
