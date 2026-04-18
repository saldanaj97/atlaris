'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ErrorCode,
  isKnownErrorCode,
} from '@/app/plans/new/components/PdfUploadError';
import { extractionApiResponseSchema } from '@/features/pdf/validation/pdf';
import type {
  ExtractionApiResponseData,
  ExtractionProofData,
  ExtractionSection,
  TruncationData,
} from '@/features/pdf/validation/pdf.types';
import { normalizeApiErrorResponse } from '@/lib/api/error-response';
import { isAbortError } from '@/lib/errors';
import { clientLogger } from '@/lib/logging/client';

const PDF_EXTRACTION_TIMEOUT_MS = 45_000;

type PdfExtractionExtractionPayload = {
  mainTopic: string;
  sections: ExtractionSection[];
  pageCount: number;
  confidence: 'high' | 'medium' | 'low';
  truncation?: TruncationData;
};

type PdfExtractionSuccess = {
  extraction: PdfExtractionExtractionPayload;
  proof: ExtractionProofData;
};

type PdfExtractionTruncationNotice = {
  truncated: boolean;
  reasonCodes: string[];
};

type PdfExtractionState =
  | { phase: 'idle' }
  | { phase: 'uploading' }
  | {
      phase: 'success';
      data: PdfExtractionSuccess;
      notice?: PdfExtractionTruncationNotice;
    }
  | {
      phase: 'error';
      message: string;
      code?: ErrorCode;
      kind: 'timeout' | 'cancel' | 'other';
    };

type ExtractionApiParseResult =
  | { ok: true; data: ExtractionApiResponseData }
  | { ok: false; error: string };

function parseExtractionApiResponse(
  rawData: unknown
): ExtractionApiParseResult {
  const result = extractionApiResponseSchema.safeParse(rawData);
  if (!result.success) {
    return {
      ok: false,
      error: result.error.issues[0]?.message ?? 'Invalid extraction response.',
    };
  }
  return { ok: true, data: result.data };
}

function handleExtractionApiError(params: {
  rawData: unknown;
  status: number;
  fallbackMessage: string;
}): { error: string; code?: ErrorCode } {
  const normalizedError = normalizeApiErrorResponse(params.rawData, {
    status: params.status,
    fallbackMessage: params.fallbackMessage,
  });

  const code: ErrorCode | undefined = isKnownErrorCode(normalizedError.code)
    ? normalizedError.code
    : undefined;

  return {
    error: normalizedError.error,
    code,
  };
}

function buildPdfTruncationNotice(
  truncation: TruncationData | undefined
): PdfExtractionTruncationNotice | undefined {
  if (!truncation?.truncated) {
    return undefined;
  }
  return {
    truncated: true,
    reasonCodes: truncation.reasons ?? [],
  };
}

interface UsePdfExtractionResult {
  state: PdfExtractionState;
  /** Returns false when the file is not a PDF (caller may toast). */
  startExtraction: (file: File) => boolean;
  /** Returns true when an in-flight extraction was aborted (caller may toast). */
  cancelExtraction: () => boolean;
  resetToIdle: () => void;
}

type UsePdfExtractionOptions = {
  /** Override for tests; production should omit. */
  extractionTimeoutMs?: number;
};

export function usePdfExtraction(
  options: UsePdfExtractionOptions = {}
): UsePdfExtractionResult {
  const extractionTimeoutMs =
    options.extractionTimeoutMs ?? PDF_EXTRACTION_TIMEOUT_MS;
  const [state, setState] = useState<PdfExtractionState>({ phase: 'idle' });
  const extractionAbortControllerRef = useRef<AbortController | null>(null);
  const extractionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const extractionAbortReasonRef = useRef<'timeout' | 'cancel' | null>(null);

  const clearExtractionTimeout = useCallback(() => {
    if (extractionTimeoutRef.current !== null) {
      clearTimeout(extractionTimeoutRef.current);
      extractionTimeoutRef.current = null;
    }
  }, []);

  const clearExtractionTracking = useCallback(() => {
    extractionAbortControllerRef.current = null;
    extractionAbortReasonRef.current = null;
    clearExtractionTimeout();
  }, [clearExtractionTimeout]);

  const abortExtraction = useCallback(
    (reason: 'timeout' | 'cancel') => {
      extractionAbortReasonRef.current = reason;
      extractionAbortControllerRef.current?.abort();
      extractionAbortControllerRef.current = null;
      clearExtractionTimeout();
    },
    [clearExtractionTimeout]
  );

  useEffect(() => {
    return () => {
      extractionAbortReasonRef.current = 'cancel';
      extractionAbortControllerRef.current?.abort();
      extractionAbortControllerRef.current = null;
      if (extractionTimeoutRef.current !== null) {
        clearTimeout(extractionTimeoutRef.current);
        extractionTimeoutRef.current = null;
      }
    };
  }, []);

  const resetToIdle = useCallback(() => {
    clearExtractionTracking();
    setState({ phase: 'idle' });
  }, [clearExtractionTracking]);

  const cancelExtraction = useCallback((): boolean => {
    if (!extractionAbortControllerRef.current) {
      setState({ phase: 'idle' });
      return false;
    }
    abortExtraction('cancel');
    return true;
  }, [abortExtraction]);

  const startExtraction = useCallback(
    (file: File): boolean => {
      if (file.type !== 'application/pdf') {
        return false;
      }

      if (extractionAbortControllerRef.current) {
        abortExtraction('cancel');
      }

      setState({ phase: 'uploading' });

      const formData = new FormData();
      formData.append('file', file);

      const controller = new AbortController();
      extractionAbortControllerRef.current = controller;
      extractionAbortReasonRef.current = null;
      clearExtractionTimeout();
      extractionTimeoutRef.current = setTimeout(() => {
        abortExtraction('timeout');
      }, extractionTimeoutMs);

      void fetch('/api/v1/plans/from-pdf/extract', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })
        .then(async (response) => {
          const rawData: unknown = await response.json();
          const parseResult = parseExtractionApiResponse(rawData);

          if (!parseResult.ok) {
            const normalizedApiError = handleExtractionApiError({
              rawData,
              status: response.status,
              fallbackMessage:
                'Invalid response from server. Please try again.',
            });

            clientLogger.error('PDF extraction response validation failed', {
              error: parseResult.error,
              responseOk: response.ok,
            });
            setState({
              phase: 'error',
              message: normalizedApiError.error,
              code: normalizedApiError.code,
              kind: 'other',
            });
            return;
          }

          const data = parseResult.data;

          if (
            !response.ok ||
            !data.success ||
            !data.extraction ||
            !data.proof
          ) {
            const normalizedApiError = handleExtractionApiError({
              rawData: data,
              status: response.status,
              fallbackMessage: 'Failed to extract PDF content',
            });

            setState({
              phase: 'error',
              message: normalizedApiError.error,
              code: normalizedApiError.code,
              kind: 'other',
            });
            return;
          }

          const notice = buildPdfTruncationNotice(data.extraction.truncation);

          setState({
            phase: 'success',
            data: {
              extraction: {
                mainTopic: data.extraction.structure.suggestedMainTopic,
                sections: data.extraction.structure.sections,
                pageCount: data.extraction.pageCount,
                confidence: data.extraction.structure.confidence,
                truncation: data.extraction.truncation,
              },
              proof: data.proof,
            },
            notice,
          });
        })
        .catch((error: unknown) => {
          if (isAbortError(error)) {
            if (extractionAbortReasonRef.current === 'cancel') {
              setState({ phase: 'idle' });
              return;
            }

            setState({
              phase: 'error',
              message: 'Upload timed out. Please try again.',
              kind: 'timeout',
            });
            return;
          }

          clientLogger.error('PDF extraction failed', error);
          setState({
            phase: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'An unexpected error occurred',
            kind: 'other',
          });
        })
        .finally(() => {
          clearExtractionTracking();
        });

      return true;
    },
    [
      abortExtraction,
      clearExtractionTimeout,
      clearExtractionTracking,
      extractionTimeoutMs,
    ]
  );

  return {
    state,
    startExtraction,
    cancelExtraction,
    resetToIdle,
  };
}
