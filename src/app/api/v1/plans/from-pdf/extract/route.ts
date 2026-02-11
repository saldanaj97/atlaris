import {
  type PlainHandler,
  withAuthAndRateLimit,
  withErrorBoundary,
} from '@/lib/api/auth';
import {
  acquirePdfExtractionSlot,
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
import { capExtractionResponsePayload } from '@/lib/pdf/structure';
import type { ExtractedSection } from '@/lib/pdf/types';
import { scanBufferForMalware } from '@/lib/security/malware-scanner';
import {
  computePdfExtractionHash,
  issuePdfExtractionProof,
  toPdfExtractionProofPayload,
} from '@/lib/security/pdf-extraction-proof';
import { resolveUserTier, type SubscriptionTier } from '@/lib/stripe/usage';
import { pdfExtractionFormDataSchema } from '@/lib/validation/pdf';

/** Absolute maximum PDF upload size in bytes (50MB) — regardless of tier */
const ABSOLUTE_MAX_PDF_BYTES = 50 * 1024 * 1024;
// Intentionally route-level constants: keep explicit control here even though
// extract.ts has matching defaults.
const PDF_EXTRACTION_TIMEOUT_MS = 30_000;
const PDF_EXTRACTION_MAX_CHARS = 500_000;

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

const toUploadValidationError = (
  result: Extract<
    Awaited<ReturnType<typeof validatePdfUpload>>,
    { allowed: false }
  >
) => {
  const status = result.code === 'FILE_TOO_LARGE' ? 413 : 400;
  return errorResponse(result.reason, result.code, status);
};

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

type StreamSizeCheckResult =
  | { ok: true; body: ArrayBuffer }
  | { ok: false; code: 'FILE_TOO_LARGE'; status: 413 }
  | { ok: false; code: 'MISSING_CONTENT_LENGTH'; status: 411 }
  | { ok: false; code: 'INVALID_FILE'; status: 400 };

/**
 * Streams the request body and counts bytes against maxBytes.
 * Aborts and returns error as soon as limit is exceeded.
 * Never buffers more than maxBytes; prevents memory exhaustion from oversized uploads.
 */
async function streamedSizeCheck(
  req: Request,
  maxBytes: number
): Promise<StreamSizeCheckResult> {
  const contentType = req.headers.get('content-type');
  if (!contentType?.toLowerCase().includes('multipart/form-data')) {
    return { ok: false, code: 'INVALID_FILE', status: 400 };
  }

  const reader = req.body?.getReader();
  if (!reader) {
    return { ok: false, code: 'MISSING_CONTENT_LENGTH', status: 411 };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, code: 'FILE_TOO_LARGE', status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, code: 'INVALID_FILE', status: 400 };
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return { ok: true, body: merged.buffer };
}

export const POST: PlainHandler = withErrorBoundary(
  withAuthAndRateLimit('aiGeneration', async ({ req, userId }) => {
    const user = await getUserByAuthId(userId);
    if (!user) {
      throw new Error(
        'Authenticated user record missing despite provisioning.'
      );
    }

    // Streamed body size check before any form parsing.
    // Counts bytes as they arrive; aborts and returns 413 as soon as limit exceeded.
    // Prevents memory exhaustion from oversized or forged Content-Length uploads.
    const streamSizeResult = await streamedSizeCheck(
      req,
      ABSOLUTE_MAX_PDF_BYTES
    );
    if (!streamSizeResult.ok) {
      const maxMb = ABSOLUTE_MAX_PDF_BYTES / (1024 * 1024);
      const message =
        streamSizeResult.code === 'FILE_TOO_LARGE'
          ? `Request body exceeds absolute maximum of ${maxMb}MB.`
          : streamSizeResult.code === 'MISSING_CONTENT_LENGTH'
            ? `Missing or invalid Content-Length header; a numeric Content-Length is required and uploads are limited to ${maxMb} MB.`
            : 'Invalid request body.';
      return errorResponse(
        message,
        streamSizeResult.code,
        streamSizeResult.status
      );
    }

    // Per-user extraction throttle
    const throttle = acquirePdfExtractionSlot(user.id);
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

    let formData: FormData;
    try {
      formData = await new Request(req.url, {
        method: req.method,
        headers: { 'content-type': req.headers.get('content-type') ?? '' },
        body: streamSizeResult.body,
      }).formData();
    } catch {
      return toExtractionError('Invalid multipart form data.', 400);
    }
    const formObject = parseFormDataToObject(formData);

    const parseResult = pdfExtractionFormDataSchema.safeParse(formObject);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      const message = firstError?.message ?? 'Invalid request.';
      const isMimeError = message.includes('PDF files');
      return toExtractionError(message, isMimeError ? 415 : 400);
    }

    const { file } = parseResult.data;

    let cachedTier: Awaited<ReturnType<typeof resolveUserTier>> | undefined;
    let tierResolved = false;
    const validationDeps = {
      resolveTier: async (
        tierUserId: string,
        dbClient?: Parameters<typeof resolveUserTier>[1]
      ): Promise<SubscriptionTier> => {
        if (tierResolved) {
          // Safety: resolveUserTier should always return a concrete tier per its contract.
          const resolvedTier = cachedTier;
          if (!resolvedTier) {
            throw new Error('resolveTier cache resolved without a valid tier');
          }
          return resolvedTier;
        }
        cachedTier = await resolveUserTier(tierUserId, dbClient);
        // Safety: resolveUserTier should always return a concrete tier per its contract.
        const resolvedTier = cachedTier;
        if (!resolvedTier) {
          throw new Error(
            'Unable to resolve user tier for PDF upload validation'
          );
        }
        tierResolved = true;
        return resolvedTier;
      },
    };

    const tierSizeCheck = await checkPdfSizeLimit(
      user.id,
      file.size,
      validationDeps
    );
    if (!tierSizeCheck.allowed) {
      return errorResponse(tierSizeCheck.reason, tierSizeCheck.code, 413);
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
      pageCountForValidation,
      validationDeps
    );
    if (!tierValidation.allowed) {
      return toUploadValidationError(tierValidation);
    }

    const extraction = await extractTextFromPdf(buffer, {
      timeoutMs: PDF_EXTRACTION_TIMEOUT_MS,
      maxChars: PDF_EXTRACTION_MAX_CHARS,
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
      extraction.pageCount,
      validationDeps
    );
    if (!finalTierValidation.allowed) {
      return toUploadValidationError(finalTierValidation);
    }

    const boundedExtraction = capExtractionResponsePayload({
      text: extraction.text,
      pageCount: extraction.pageCount,
      metadata: extraction.metadata,
      structure: extraction.structure,
    });

    const extractionProofInput: {
      mainTopic: string;
      sections: ExtractedSection[];
    } = {
      mainTopic: boundedExtraction.payload.structure.suggestedMainTopic,
      sections: boundedExtraction.payload.structure.sections,
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
        text: boundedExtraction.payload.text,
        pageCount: boundedExtraction.payload.pageCount,
        metadata: boundedExtraction.payload.metadata,
        structure: boundedExtraction.payload.structure,
        truncation: boundedExtraction.truncation,
      },
      proof: toPdfExtractionProofPayload({
        token: issuedProof.token,
        extractionHash,
        expiresAt: issuedProof.expiresAt,
      }),
    });
  })
);
