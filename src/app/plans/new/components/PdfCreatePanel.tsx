'use client';

import {
  PdfExtractionPreview,
  type PdfPlanSettings,
} from '@/components/pdf/PdfExtractionPreview';
import {
  isKnownErrorCode,
  PdfUploadError,
  type ErrorCode,
} from '@/components/pdf/PdfUploadError';
import { PdfUploadZone } from '@/components/pdf/PdfUploadZone';
import {
  isStreamingError,
  useStreamingPlanGeneration,
} from '@/hooks/useStreamingPlanGeneration';
import { normalizeApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';
import { mapPdfSettingsToCreateInput } from '@/lib/mappers/learningPlans';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

const truncationSchema = z.object({
  truncated: z.boolean(),
  maxBytes: z.number(),
  returnedBytes: z.number(),
  reasons: z.array(z.string()),
  limits: z.object({
    maxTextChars: z.number(),
    maxSections: z.number(),
    maxSectionChars: z.number(),
  }),
});

type TruncationData = z.infer<typeof truncationSchema>;

const TRUNCATION_REASON_LABELS: Record<string, string> = {
  text_char_cap: 'raw text length limit',
  section_count_cap: 'section count limit',
  suggested_topic_cap: 'main topic length limit',
  section_title_cap: 'section title length limit',
  section_content_cap: 'section content length limit',
  byte_cap_text_trim: 'total size (text trimmed)',
  byte_cap_section_trim: 'total size (sections reduced)',
  byte_cap_section_content_trim: 'total size (section content trimmed)',
  byte_cap_topic_trim: 'total size (topic trimmed)',
  byte_cap_hard_reset: 'size limit (heavy trim)',
  byte_cap_hard_reset_warning: 'content heavily reduced',
};

const MAX_TRUNCATION_REASONS_IN_TOAST = 3;

function normalizeThrown(value: unknown): Error | { message?: string } {
  return value instanceof Error ? value : { message: String(value) };
}

function truncationReasonsSummary(
  reasons: string[] | undefined
): string | null {
  if (!reasons?.length) return null;
  const labels = reasons
    .slice(0, MAX_TRUNCATION_REASONS_IN_TOAST)
    .map((code) => TRUNCATION_REASON_LABELS[code] ?? code)
    .filter(Boolean);
  if (labels.length === 0) return null;
  return labels.join('; ');
}

const extractionApiResponseSchema = z.object({
  success: z.boolean(),
  extraction: z
    .object({
      text: z.string(),
      pageCount: z.number(),
      metadata: z
        .object({
          title: z.string().optional(),
          author: z.string().optional(),
          subject: z.string().optional(),
        })
        .optional(),
      structure: z.object({
        sections: z.array(
          z.object({
            title: z.string(),
            content: z.string(),
            level: z.number(),
            suggestedTopic: z.string().optional(),
          })
        ),
        suggestedMainTopic: z.string(),
        confidence: z.enum(['high', 'medium', 'low']),
      }),
      truncation: truncationSchema.optional(),
    })
    .optional(),
  proof: z
    .object({
      token: z.string(),
      extractionHash: z.string(),
      expiresAt: z.string(),
      version: z.literal(1),
    })
    .optional(),
  error: z.string().optional(),
  code: z.string().optional(),
});

type ExtractionApiResponse = z.infer<typeof extractionApiResponseSchema>;

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

interface PdfCreatePanelProps {
  onSwitchToManual: (extractedTopic: string) => void;
}

interface ExtractionData {
  mainTopic: string;
  sections: Array<{
    title: string;
    content: string;
    level: number;
    suggestedTopic?: string;
  }>;
  pageCount: number;
  confidence: 'high' | 'medium' | 'low';
  truncation?: TruncationData;
}

interface ExtractionProofData {
  token: string;
  extractionHash: string;
  expiresAt: string;
  version: 1;
}

type PageState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | {
      status: 'preview';
      extraction: ExtractionData;
      proof: ExtractionProofData;
    }
  | { status: 'generating' }
  | { status: 'error'; error: string; code?: ErrorCode };

type PdfMappingResult =
  | { ok: true; payload: ReturnType<typeof mapPdfSettingsToCreateInput> }
  | { ok: false; error: unknown };

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function buildPdfCreatePayload(params: {
  mainTopic: string;
  sections: ExtractionData['sections'];
  settings: PdfPlanSettings;
  proof: ExtractionProofData;
}): PdfMappingResult {
  const { mainTopic, sections, settings, proof } = params;
  const { skillLevel, weeklyHours, learningStyle, deadlineWeeks } = settings;

  try {
    return {
      ok: true,
      payload: mapPdfSettingsToCreateInput({
        mainTopic,
        sections,
        skillLevel,
        weeklyHours,
        learningStyle,
        deadlineWeeks,
        pdfProofToken: proof.token,
        pdfExtractionHash: proof.extractionHash,
        pdfProofVersion: proof.version,
      }),
    };
  } catch (error) {
    return { ok: false, error };
  }
}

export function PdfCreatePanel({
  onSwitchToManual,
}: PdfCreatePanelProps): React.ReactElement {
  const router = useRouter();
  const [state, setState] = useState<PageState>({ status: 'idle' });
  const isSubmittingRef = useRef(false);
  const planIdRef = useRef<string | undefined>(undefined);
  const { startGeneration } = useStreamingPlanGeneration();

  const handleFileSelect = (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('Please select a PDF file');
      return;
    }

    setState({ status: 'uploading' });

    const formData = new FormData();
    formData.append('file', file);

    void fetch('/api/v1/plans/from-pdf/extract', {
      method: 'POST',
      body: formData,
    })
      .then(async (response) => {
        const rawData: unknown = await response.json();
        const parseResult = extractionApiResponseSchema.safeParse(rawData);

        if (!parseResult.success) {
          const normalizedApiError = handleExtractionApiError({
            rawData,
            status: response.status,
            fallbackMessage: 'Invalid response from server. Please try again.',
          });

          clientLogger.error('PDF extraction response validation failed', {
            error: parseResult.error.flatten(),
            responseOk: response.ok,
          });
          setState({
            status: 'error',
            error: normalizedApiError.error,
            code: normalizedApiError.code,
          });
          return;
        }

        const data: ExtractionApiResponse = parseResult.data;

        if (!response.ok || !data.success || !data.extraction || !data.proof) {
          const normalizedApiError = handleExtractionApiError({
            rawData,
            status: response.status,
            fallbackMessage: 'Failed to extract PDF content',
          });

          setState({
            status: 'error',
            error: normalizedApiError.error,
            code: normalizedApiError.code,
          });
          return;
        }

        setState({
          status: 'preview',
          extraction: {
            mainTopic: data.extraction.structure.suggestedMainTopic,
            sections: data.extraction.structure.sections,
            pageCount: data.extraction.pageCount,
            confidence: data.extraction.structure.confidence,
            truncation: data.extraction.truncation,
          },
          proof: data.proof,
        });

        if (data.extraction.truncation?.truncated) {
          const summary = truncationReasonsSummary(
            data.extraction.truncation.reasons
          );
          const message = summary
            ? `Content trimmed: ${summary}. You can still edit the extracted sections before generating.`
            : 'Large PDF content was trimmed for safety. You can still edit the extracted sections before generating.';
          toast.info(message);
        }
      })
      .catch((error: unknown) => {
        clientLogger.error('PDF extraction failed', error);
        setState({
          status: 'error',
          error:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        });
      });
  };

  const handleGenerate = (editedData: {
    mainTopic: string;
    sections: ExtractionData['sections'];
    settings: PdfPlanSettings;
  }) => {
    if (state.status === 'generating' || isSubmittingRef.current) {
      return;
    }

    if (state.status !== 'preview') {
      return;
    }

    const { proof } = state;

    isSubmittingRef.current = true;
    setState({ status: 'generating' });

    const payloadResult = buildPdfCreatePayload({
      mainTopic: editedData.mainTopic,
      sections: editedData.sections,
      settings: editedData.settings,
      proof,
    });

    if (!payloadResult.ok) {
      clientLogger.error('Failed to build plan payload from PDF settings', {
        error: payloadResult.error,
      });
      setState({
        status: 'error',
        error: 'Failed to create learning plan. Please try again.',
      });
      isSubmittingRef.current = false;
      return;
    }

    void startGeneration(payloadResult.payload)
      .then((streamPlanId) => {
        planIdRef.current = streamPlanId;
        toast.success('Your learning plan is ready!');
        router.push(`/plans/${streamPlanId}`);
      })
      .catch((streamError: unknown) => {
        if (isAbortError(streamError)) {
          toast.info('Generation cancelled');
          setState({ status: 'idle' });
          return;
        }

        clientLogger.error('Plan generation failed', streamError);

        const streamErr = normalizeThrown(streamError);
        const message =
          streamErr instanceof Error
            ? streamErr.message
            : 'Failed to create learning plan. Please try again.';

        const extractedPlanId = isStreamingError(streamErr)
          ? (streamErr.planId ?? streamErr.data?.planId ?? planIdRef.current)
          : planIdRef.current;

        if (
          extractedPlanId &&
          typeof extractedPlanId === 'string' &&
          extractedPlanId.length > 0
        ) {
          toast.error('Generation failed. You can retry from the plan page.');
          router.push(`/plans/${extractedPlanId}`);
          return;
        }

        const errorCode = isStreamingError(streamErr)
          ? streamErr.code === 'QUOTA_EXCEEDED'
            ? ('QUOTA_EXCEEDED' as ErrorCode)
            : undefined
          : undefined;

        setState({
          status: 'error',
          error: message,
          code: errorCode,
        });
      })
      .finally(() => {
        isSubmittingRef.current = false;
      });
  };

  const handleRetry = () => {
    isSubmittingRef.current = false;
    setState({ status: 'idle' });
  };

  const handleBack = () => {
    isSubmittingRef.current = false;
    setState({ status: 'idle' });
  };

  if (state.status === 'idle') {
    return (
      <PdfUploadZone
        onFileSelect={(file) => {
          void handleFileSelect(file);
        }}
        isUploading={false}
        disabled={false}
      />
    );
  }

  if (state.status === 'uploading') {
    return (
      <PdfUploadZone
        onFileSelect={(file) => {
          void handleFileSelect(file);
        }}
        isUploading={true}
        disabled={true}
      />
    );
  }

  if (state.status === 'preview') {
    return (
      <PdfExtractionPreview
        mainTopic={state.extraction.mainTopic}
        sections={state.extraction.sections}
        pageCount={state.extraction.pageCount}
        confidence={state.extraction.confidence}
        onGenerate={(editedData) => {
          void handleGenerate(editedData);
        }}
        onSwitchToManual={onSwitchToManual}
        isGenerating={false}
      />
    );
  }

  if (state.status === 'generating') {
    return (
      <div className="w-full max-w-3xl">
        <div className="dark:border-border dark:bg-card/60 border-border bg-card/60 relative rounded-3xl border px-6 py-12 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col items-center text-center">
            <div className="from-primary to-accent mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br shadow-lg">
              <Loader2 className="h-10 w-10 animate-spin text-white" />
            </div>
            <h3 className="text-foreground mb-2 text-xl font-semibold">
              Creating your learning plan...
            </h3>
            <p className="text-muted-foreground text-sm">
              This will only take a moment
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <PdfUploadError
        error={state.error}
        code={state.code}
        onRetry={handleRetry}
        onBack={handleBack}
      />
    );
  }

  // Unreachable: all PageState variants are handled above
  const _exhaustiveCheck: never = state;
  return _exhaustiveCheck;
}
