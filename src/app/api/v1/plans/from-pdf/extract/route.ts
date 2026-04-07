import { resolveUserTier } from '@/features/billing/tier';
import {
  extractTextFromPdf as defaultExtractTextFromPdf,
  getPdfPageCountFromBuffer as defaultGetPdfPageCountFromBuffer,
} from '@/features/pdf/extract';
import { scanBufferForMalware as defaultScanBufferForMalware } from '@/features/pdf/security/malware-scanner';
import {
  computePdfExtractionHash,
  issuePdfExtractionProof,
  toPdfExtractionProofPayload,
} from '@/features/pdf/security/pdf-extraction-proof';
import {
  type CapExtractionResponse,
  capExtractionResponsePayload,
} from '@/features/pdf/structure';
import type { ExtractedSection } from '@/features/pdf/types';
import { pdfExtractionFormDataSchema } from '@/features/pdf/validation/pdf';
import { type PlainHandler, withAuthAndRateLimit } from '@/lib/api/auth';
import { withErrorBoundary } from '@/lib/api/middleware';
import {
  acquireGlobalPdfExtractionSlot,
  acquirePdfExtractionSlot,
  checkPdfSizeLimit,
  validatePdfUpload,
} from '@/lib/api/pdf-rate-limit';
import { json } from '@/lib/api/response';
import type { DbUser } from '@/lib/db/queries/types/users.types';
import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';
import type { SubscriptionTier } from '@/shared/types/billing.types';

/** Dependencies for PDF extract POST handler; inject for testing. */
export type PdfExtractRouteDeps = {
  extractTextFromPdf: typeof defaultExtractTextFromPdf;
  getPdfPageCountFromBuffer: typeof defaultGetPdfPageCountFromBuffer;
  scanBufferForMalware: typeof defaultScanBufferForMalware;
};

/** PDF file magic bytes for content-type validation */
const PDF_SIGNATURE = Buffer.from('%PDF-', 'utf8');

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
  if (buffer.length < PDF_SIGNATURE.length) {
    return false;
  }
  return buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE);
};

function parseFormDataToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    result[key] = value;
  }
  return result;
}

type PdfExtractHandlerCtx = { req: Request; userId: string; user: DbUser };

async function postHandlerImpl(
  ctx: PdfExtractHandlerCtx,
  deps: PdfExtractRouteDeps
): Promise<Response> {
  // ctx.userId is the auth/identity-provider ID; ctx.user.id is the app DB primary key.
  // issuePdfExtractionProof uses userId (auth ID) because proofs are tied to oauth/auth identity.
  // The rest of the handler uses user.id for throttling, tier checks, and logging.
  const { req, userId, user } = ctx;

  const contentType = req.headers.get('content-type');
  if (!contentType?.toLowerCase().includes('multipart/form-data')) {
    return toExtractionError('Invalid request body.', 400);
  }

  if (!req.body) {
    const maxMb = ABSOLUTE_MAX_PDF_BYTES / (1024 * 1024);
    return errorResponse(
      `Missing or invalid Content-Length header; a numeric Content-Length is required and uploads are limited to ${maxMb} MB.`,
      'MISSING_CONTENT_LENGTH',
      411
    );
  }

  // When Content-Length is present (typical for browser multipart uploads), reject
  // oversized bodies before buffering the full multipart parse. Clients without a
  // length (e.g. some fetch/FormData implementations) skip this gate; file.size is
  // still enforced below via checkPdfSizeLimit and tier limits (≤ absolute cap).
  const contentLengthHeader = req.headers.get('content-length')?.trim();
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return toExtractionError('Invalid Content-Length header.', 400);
    }
    if (contentLength > ABSOLUTE_MAX_PDF_BYTES) {
      const maxMb = ABSOLUTE_MAX_PDF_BYTES / (1024 * 1024);
      return errorResponse(
        `Request body exceeds absolute maximum of ${maxMb}MB.`,
        'FILE_TOO_LARGE',
        413
      );
    }
  }

  const throttle = acquirePdfExtractionSlot(user.id);
  if (!throttle.allowed) {
    return json(
      {
        success: false,
        error: 'Too many PDF extraction requests. Please try again later.',
        code: 'THROTTLED',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((throttle.retryAfterMs ?? 0) / 1000)),
        },
      }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error(
      { error: message, stack },
      'FormData parse failed in PDF extract route'
    );
    return toExtractionError('Invalid multipart form data.', 400);
  }
  const rawFile = formData.get('file');
  if (rawFile instanceof File && rawFile.type === '') {
    logger.warn(
      { fileName: rawFile.name },
      'PDF upload with empty Content-Type (client omitted MIME type)'
    );
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
  const db = getDb();

  let cachedTier: SubscriptionTier | undefined;
  let tierResolved = false;
  const validationDeps = {
    resolveTier: async (
      tierUserId: string,
      dbClient: Parameters<typeof resolveUserTier>[1]
    ): Promise<SubscriptionTier> => {
      if (tierResolved) return cachedTier as SubscriptionTier;
      cachedTier = await resolveUserTier(tierUserId, dbClient);
      tierResolved = true;
      return cachedTier;
    },
  };

  const tierSizeCheck = await checkPdfSizeLimit(
    user.id,
    file.size,
    db,
    validationDeps
  );
  if (!tierSizeCheck.allowed) {
    return errorResponse(tierSizeCheck.reason, tierSizeCheck.code, 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isPdfMagicBytes(buffer)) {
    return toExtractionError('Invalid PDF file format.', 415);
  }

  const globalSlot = acquireGlobalPdfExtractionSlot();
  if (!globalSlot.allowed) {
    return json(
      {
        success: false,
        error: 'PDF extraction is busy. Please retry shortly.',
        code: 'THROTTLED',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(
            Math.ceil((globalSlot.retryAfterMs ?? 0) / 1000)
          ),
        },
      }
    );
  }

  try {
    try {
      const scanResult = await deps.scanBufferForMalware(buffer);
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
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      logger.error(
        { userId: user.id, fileSize: file.size, error: message, stack },
        'Malware scan failed for uploaded PDF'
      );
      return errorResponse(
        'Unable to verify file security. Please try again.',
        'SCAN_FAILED',
        500
      );
    }

    const pageCountForValidation = await deps.getPdfPageCountFromBuffer(buffer);
    const tierValidation = await validatePdfUpload(
      user.id,
      file.size,
      pageCountForValidation,
      db,
      validationDeps
    );
    if (!tierValidation.allowed) {
      return toUploadValidationError(tierValidation);
    }

    const extraction = await deps.extractTextFromPdf(buffer, {
      timeoutMs: PDF_EXTRACTION_TIMEOUT_MS,
      maxChars: PDF_EXTRACTION_MAX_CHARS,
      signal: req.signal,
    });

    if (!extraction.success) {
      if (extraction.error === 'parse_timeout') {
        return errorResponse(extraction.message, 'INVALID_FILE', 422);
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
        pageCount: pageCountForValidation,
        textLength: extraction.text.length,
        parseTimeMs: extraction.parseTimeMs,
        truncatedText: extraction.truncatedText,
      },
      'PDF extraction completed'
    );

    const boundedExtraction: CapExtractionResponse =
      capExtractionResponsePayload({
        text: extraction.text,
        pageCount: pageCountForValidation,
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
        dbClient: db,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      logger.error(
        { userId: user.id, extractionHash, message, stack },
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
  } finally {
    globalSlot.release();
  }
}

export function createPostHandler(deps: PdfExtractRouteDeps): PlainHandler {
  return withErrorBoundary(
    withAuthAndRateLimit('aiGeneration', (ctx) => postHandlerImpl(ctx, deps))
  );
}

export const POST = createPostHandler({
  extractTextFromPdf: defaultExtractTextFromPdf,
  getPdfPageCountFromBuffer: defaultGetPdfPageCountFromBuffer,
  scanBufferForMalware: defaultScanBufferForMalware,
});
