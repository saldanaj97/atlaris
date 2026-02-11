import { z } from 'zod';

import {
  type PlainHandler,
  withAuthAndRateLimit,
  withErrorBoundary,
} from '@/lib/api/auth';
import {
  checkPdfExtractionThrottle,
  checkPdfSizeLimit,
  validatePdfUpload,
} from '@/lib/api/pdf-rate-limit';
import { json } from '@/lib/api/response';
import { getUserByAuthId } from '@/lib/db/queries/users';
import { logger } from '@/lib/logging/logger';
import {
  extractTextFromPdf,
  getPdfPageCountFromBuffer,
} from '@/lib/pdf/extract';
import type { ExtractedSection } from '@/lib/pdf/types';
import { scanBufferForMalware } from '@/lib/security/malware-scanner';
import {
  computePdfExtractionHash,
  issuePdfExtractionProof,
  toPdfExtractionProofPayload,
} from '@/lib/security/pdf-extraction-proof';

/** Absolute maximum PDF upload size in bytes (50MB) — regardless of tier */
const ABSOLUTE_MAX_PDF_BYTES = 50 * 1024 * 1024;

export type PdfErrorCode =
  | 'FILE_TOO_LARGE'
  | 'TOO_MANY_PAGES'
  | 'MISSING_CONTENT_LENGTH'
  | 'NO_TEXT'
  | 'INVALID_FILE'
  | 'PASSWORD_PROTECTED'
  | 'QUOTA_EXCEEDED'
  | 'MALWARE_DETECTED'
  | 'SCAN_FAILED'
  | 'PROOF_ISSUANCE_FAILED'
  | 'THROTTLED';

const errorResponse = (message: string, code: PdfErrorCode, status: number) =>
  json({ success: false, error: message, code }, { status });

const toExtractionError = (message: string, status = 400) =>
  errorResponse(message, 'INVALID_FILE', status);

const fileSchema = z
  .instanceof(File)
  .refine((file) => file.size > 0, 'PDF file is empty.')
  .refine(
    (file) => file.type === 'application/pdf',
    'Only PDF files are supported.'
  );

const formDataSchema = z
  .object({
    file: fileSchema,
  })
  .strict();

const isPdfMagicBytes = (buffer: Buffer): boolean => {
  const signature = Buffer.from('%PDF-', 'utf8');
  if (buffer.length < signature.length) {
    return false;
  }
  return buffer.subarray(0, signature.length).equals(signature);
};

function parseFormDataToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    result[key] = value;
  }
  return result;
}

export const POST: PlainHandler = withErrorBoundary(
  withAuthAndRateLimit('aiGeneration', async ({ req, userId }) => {
    const user = await getUserByAuthId(userId);
    if (!user) {
      throw new Error(
        'Authenticated user record missing despite provisioning.'
      );
    }

    // Hard body size check before reading form data into memory.
    // Reject early to avoid loading large bodies; tier checks happen later.
    const rawContentLength = req.headers.get('content-length');
    const parsedContentLength =
      rawContentLength !== null ? Number.parseInt(rawContentLength, 10) : NaN;
    if (
      rawContentLength === null ||
      !/^\d+$/.test(rawContentLength) ||
      !Number.isFinite(parsedContentLength)
    ) {
      const maxMb = ABSOLUTE_MAX_PDF_BYTES / (1024 * 1024);
      return errorResponse(
        `Missing or invalid Content-Length header; a numeric Content-Length is required and uploads are limited to ${maxMb} MB.`,
        'MISSING_CONTENT_LENGTH',
        rawContentLength === null ? 411 : 400
      );
    }
    const contentLength = parsedContentLength;
    if (contentLength > ABSOLUTE_MAX_PDF_BYTES) {
      return errorResponse(
        `Request body exceeds absolute maximum of ${ABSOLUTE_MAX_PDF_BYTES / (1024 * 1024)}MB.`,
        'FILE_TOO_LARGE',
        413
      );
    }

    // Per-user extraction throttle
    const throttle = checkPdfExtractionThrottle(user.id);
    if (!throttle.allowed) {
      return json(
        {
          success: false,
          error: 'Too many PDF extraction requests. Please try again later.',
          code: 'THROTTLED' as const,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(
              Math.ceil((throttle.retryAfterMs ?? 0) / 1000)
            ),
          },
        }
      );
    }

    const formData = await req.formData();
    const formObject = parseFormDataToObject(formData);

    const parseResult = formDataSchema.safeParse(formObject);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      const message = firstError?.message ?? 'Invalid request.';
      const isMimeError = message.includes('PDF files');
      return toExtractionError(message, isMimeError ? 415 : 400);
    }

    const { file } = parseResult.data;

    const sizeCheck = await checkPdfSizeLimit(user.id, file.size);
    if (!sizeCheck.allowed) {
      return errorResponse(sizeCheck.reason, sizeCheck.code, 413);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (!isPdfMagicBytes(buffer)) {
      return toExtractionError('Invalid PDF file format.', 415);
    }

    try {
      const scanResult = await scanBufferForMalware(buffer);
      if (!scanResult.clean) {
        logger.warn(
          { userId: user.id, threat: scanResult.threat, fileSize: file.size },
          'Malware detected in uploaded PDF'
        );
        return errorResponse(
          'File rejected due to security concerns.',
          'MALWARE_DETECTED',
          400
        );
      }
    } catch (error) {
      logger.error(
        { userId: user.id, error, fileSize: file.size },
        'Malware scan failed for uploaded PDF'
      );
      return errorResponse(
        'Unable to verify file security. Please try again.',
        'SCAN_FAILED',
        500
      );
    }

    const pageCountForValidation = await getPdfPageCountFromBuffer(buffer);
    const tierValidation = await validatePdfUpload(
      user.id,
      file.size,
      pageCountForValidation
    );
    if (!tierValidation.allowed) {
      const status = tierValidation.code === 'FILE_TOO_LARGE' ? 413 : 400;
      return errorResponse(tierValidation.reason, tierValidation.code, status);
    }

    const extraction = await extractTextFromPdf(buffer, {
      timeoutMs: 30_000,
      maxChars: 500_000,
    });

    if (!extraction.success) {
      if (extraction.error === 'parse_timeout') {
        return errorResponse(extraction.message, 'INVALID_FILE', 408);
      }
      if (extraction.error === 'decompression_bomb') {
        return errorResponse(extraction.message, 'INVALID_FILE', 400);
      }
      if (extraction.error === 'no_text') {
        return errorResponse(extraction.message, 'NO_TEXT', 400);
      }
      if (extraction.error === 'password_protected') {
        return errorResponse(extraction.message, 'PASSWORD_PROTECTED', 400);
      }

      return toExtractionError(extraction.message);
    }

    logger.info(
      {
        userId: user.id,
        fileSize: file.size,
        pageCount: extraction.pageCount,
        textLength: extraction.text.length,
        parseTimeMs: extraction.parseTimeMs,
        truncatedText: extraction.truncatedText,
      },
      'PDF extraction completed'
    );

    const finalTierValidation = await validatePdfUpload(
      user.id,
      file.size,
      extraction.pageCount
    );
    if (!finalTierValidation.allowed) {
      const status = finalTierValidation.code === 'FILE_TOO_LARGE' ? 413 : 400;
      return errorResponse(
        finalTierValidation.reason,
        finalTierValidation.code,
        status
      );
    }

    const extractionProofInput: {
      mainTopic: string;
      sections: ExtractedSection[];
    } = {
      mainTopic: extraction.structure.suggestedMainTopic,
      sections: extraction.structure.sections,
    };
    const extractionHash = computePdfExtractionHash(extractionProofInput);
    let issuedProof: { token: string; expiresAt: Date };
    try {
      issuedProof = await issuePdfExtractionProof({
        authUserId: userId,
        extractionHash,
      });
    } catch (error) {
      logger.error(
        { userId: user.id, extractionHash, error },
        'Proof issuance failed for PDF extraction'
      );
      return errorResponse(
        'Proof generation failed, please retry',
        'PROOF_ISSUANCE_FAILED',
        500
      );
    }

    return json({
      success: true,
      extraction: {
        text: extraction.text,
        pageCount: extraction.pageCount,
        metadata: extraction.metadata,
        structure: extraction.structure,
      },
      proof: toPdfExtractionProofPayload({
        token: issuedProof.token,
        extractionHash,
        expiresAt: issuedProof.expiresAt,
      }),
    });
  })
);
