import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PDFParse, PasswordException } from 'pdf-parse';
import { getPath } from 'pdf-parse/worker';

import { logger } from '@/lib/logging/logger';

import { detectStructure } from '@/lib/pdf/structure';
import type {
  PdfExtractionOptions,
  PdfExtractionResponse,
} from '@/lib/pdf/types';

const PDF_HEADER = '%PDF-';
const ENCRYPT_TOKEN = '/Encrypt';

/** Maximum characters to extract from a PDF to prevent memory abuse */
const MAX_EXTRACTED_CHARS = 500_000; // 500K chars ≈ 250 pages of dense text

/** Maximum time allowed for PDF parsing in milliseconds */
const PDF_PARSE_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * Ratio threshold for decompression bomb detection.
 * If extracted text length exceeds buffer size * this factor, reject.
 */
const DECOMPRESSION_BOMB_RATIO = 100;

/** Resolve pdf.worker.mjs via pdf-parse's worker package so pdfjs-dist can load it in Next.js server bundle. */
function getPdfWorkerSrc(): string {
  const workerPath = getPath();
  if (!fs.existsSync(workerPath)) {
    throw new Error(
      `PDF worker not found at ${workerPath}. Ensure pdf-parse is installed.`
    );
  }
  return pathToFileURL(workerPath).href;
}

function ensurePdfWorkerSet(): void {
  try {
    const current = PDFParse.setWorker();
    if (current) return;
  } catch {
    // setWorker() throws when no worker is configured; proceed to set one
  }
  PDFParse.setWorker(getPdfWorkerSrc());
}

const getMetadataField = (
  info: unknown,
  key: 'Title' | 'Author' | 'Subject'
): string | undefined => {
  if (!info || typeof info !== 'object') {
    return undefined;
  }

  const value = (info as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
};

/** ~40KB per page — conservative heuristic for tier validation when metadata is unavailable */
const BYTES_PER_PAGE_ESTIMATE = 40_960;

/** Timeout for lightweight metadata fetch (page count) — avoid hanging on malformed PDFs */
const PAGE_COUNT_TIMEOUT_MS = 5_000;

/**
 * Lightweight page count for tier validation before full extraction.
 * Uses PDF metadata (getInfo) when possible; falls back to size-based estimate on failure.
 * Prefer this over full extraction when the goal is to reject over-limit uploads early.
 */
export async function getPdfPageCountFromBuffer(
  buffer: Buffer
): Promise<number> {
  ensurePdfWorkerSet();

  let parser: InstanceType<typeof PDFParse> | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_COUNT_TIMEOUT_MS);

  try {
    parser = new PDFParse({ data: buffer });
    const infoPromise = parser.getInfo();
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () =>
        reject(new Error('PAGE_COUNT_TIMEOUT'))
      );
    });
    const infoResult = await Promise.race([infoPromise, timeoutPromise]);
    return infoResult.total;
  } catch {
    return Math.max(1, Math.ceil(buffer.length / BYTES_PER_PAGE_ESTIMATE));
  } finally {
    clearTimeout(timer);
    await parser?.destroy().catch(() => {});
  }
}

export const extractTextFromPdf = async (
  buffer: Buffer,
  options: PdfExtractionOptions = {}
): Promise<PdfExtractionResponse> => {
  const maxChars = options.maxChars ?? MAX_EXTRACTED_CHARS;
  const timeoutMs = options.timeoutMs ?? PDF_PARSE_TIMEOUT_MS;
  const startTime = Date.now();

  const header = buffer.subarray(0, 5).toString('utf8');

  if (!header.startsWith(PDF_HEADER)) {
    return {
      success: false,
      error: 'invalid_file',
      message: 'File does not appear to be a valid PDF.',
    };
  }

  const headerScan = buffer.subarray(0, 2048).toString('latin1');
  if (headerScan.includes(ENCRYPT_TOKEN)) {
    return {
      success: false,
      error: 'password_protected',
      message: 'Password-protected PDFs are not supported.',
    };
  }

  let parser: InstanceType<typeof PDFParse> | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    ensurePdfWorkerSet();

    // Check for abort before starting parse
    if (options.signal?.aborted || controller.signal.aborted) {
      return {
        success: false,
        error: 'parse_timeout',
        message: 'PDF parsing was cancelled.',
      };
    }

    parser = new PDFParse({ data: buffer });

    const parsePromise = (async () => {
      const textResult = await parser.getText();
      const infoResult = await parser.getInfo();
      return { textResult, infoResult };
    })();

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(new Error('PDF_PARSE_TIMEOUT'));
      });
      options.signal?.addEventListener('abort', () => {
        reject(new Error('PDF_PARSE_TIMEOUT'));
      });
    });

    const { textResult, infoResult } = await Promise.race([
      parsePromise,
      timeoutPromise,
    ]);

    let text = textResult.text?.trim() ?? '';
    const parseTimeMs = Date.now() - startTime;
    const pageCount = textResult.total ?? 0;

    if (text.length === 0) {
      return {
        success: false,
        error: 'no_text',
        message: 'PDF does not contain extractable text.',
      };
    }

    // Decompression bomb check
    if (text.length > buffer.length * DECOMPRESSION_BOMB_RATIO) {
      logger.warn(
        {
          textLength: text.length,
          bufferSize: buffer.length,
          ratio: Math.round(text.length / buffer.length),
          pageCount,
        },
        'PDF decompression bomb detected: text size disproportionate to file size'
      );
      return {
        success: false,
        error: 'decompression_bomb',
        message: 'PDF appears to contain an abnormally large amount of text.',
      };
    }

    // Truncate if text exceeds maxChars
    let truncatedText = false;
    if (text.length > maxChars) {
      text = text.slice(0, maxChars);
      truncatedText = true;
      logger.info(
        {
          originalLength: textResult.text?.trim().length ?? 0,
          truncatedTo: maxChars,
          pageCount,
        },
        'PDF text truncated to max character limit'
      );
    }

    const structure = detectStructure(text);

    logger.info(
      {
        parseTimeMs,
        textLength: text.length,
        pageCount,
        truncatedText,
      },
      'PDF extraction telemetry'
    );

    return {
      success: true,
      text,
      pageCount,
      metadata: {
        title: getMetadataField(infoResult.info, 'Title'),
        author: getMetadataField(infoResult.info, 'Author'),
        subject: getMetadataField(infoResult.info, 'Subject'),
      },
      structure,
      parseTimeMs,
      truncatedText,
    };
  } catch (error) {
    const message = getErrorMessage(error);
    const lowerMessage = message.toLowerCase();

    if (message === 'PDF_PARSE_TIMEOUT') {
      logger.warn(
        { timeoutMs, parseTimeMs: Date.now() - startTime },
        'PDF parsing timed out'
      );
      return {
        success: false,
        error: 'parse_timeout',
        message: 'PDF parsing timed out. The file may be too complex.',
      };
    }

    if (error instanceof PasswordException) {
      return {
        success: false,
        error: 'password_protected',
        message: 'Password-protected PDFs are not supported.',
      };
    }

    if (lowerMessage.includes('password')) {
      return {
        success: false,
        error: 'password_protected',
        message: 'Password-protected PDFs are not supported.',
      };
    }

    logger.error({ error, rawMessage: message }, 'PDF extraction failed');

    return {
      success: false,
      error: 'extraction_failed',
      message: 'An error occurred during extraction.',
    };
  } finally {
    clearTimeout(timer);
    await parser?.destroy().catch(() => {
      // Swallow destroy errors to avoid masking the original exception
    });
  }
};
