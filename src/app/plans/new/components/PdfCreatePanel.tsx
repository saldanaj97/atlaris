'use client';

import { useRouter } from 'next/navigation';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  PdfExtractionPreview,
  type PdfPlanSettings,
} from '@/app/plans/new/components/PdfExtractionPreview';
import { PdfGeneratingState } from '@/app/plans/new/components/PdfGeneratingState';
import {
  type ErrorCode,
  PdfUploadError,
} from '@/app/plans/new/components/PdfUploadError';
import { PdfUploadingState } from '@/app/plans/new/components/PdfUploadingState';
import { PdfUploadZone } from '@/app/plans/new/components/PdfUploadZone';
import { handleStreamingPlanError } from '@/app/plans/new/components/streamingPlanError';
import type {
  ExtractionProofData,
  ExtractionSection,
  TruncationData,
} from '@/features/pdf/validation/pdf.types';
import { mapPdfSettingsToCreateInput } from '@/features/plans/create-mapper';
import { usePdfExtraction } from '@/hooks/usePdfExtraction';
import {
  isStreamingError,
  useStreamingPlanGeneration,
} from '@/hooks/useStreamingPlanGeneration';
import { clientLogger } from '@/lib/logging/client';

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

interface PdfCreatePanelProps {
  onSwitchToManual: (extractedTopic: string) => void;
}

interface ExtractionData {
  mainTopic: string;
  sections: ExtractionSection[];
  pageCount: number;
  confidence: 'high' | 'medium' | 'low';
  truncation?: TruncationData;
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

interface PdfCreatePanelBodyProps {
  state: PageState;
  onFileSelect: (file: File) => void;
  onCancelUpload: () => void;
  onGenerate: (editedData: {
    mainTopic: string;
    sections: ExtractionData['sections'];
    settings: PdfPlanSettings;
  }) => void;
  onSwitchToManual: (extractedTopic: string) => void;
  onRetry: () => void;
  onBack: () => void;
}

function PdfCreatePanelBody({
  state,
  onFileSelect,
  onCancelUpload,
  onGenerate,
  onSwitchToManual,
  onRetry,
  onBack,
}: PdfCreatePanelBodyProps): ReactElement {
  if (state.status === 'idle') {
    return (
      <PdfUploadZone
        onFileSelect={onFileSelect}
        isUploading={false}
        disabled={false}
      />
    );
  }

  if (state.status === 'uploading') {
    return <PdfUploadingState onCancelUpload={onCancelUpload} />;
  }

  if (state.status === 'preview') {
    return (
      <PdfExtractionPreview
        mainTopic={state.extraction.mainTopic}
        sections={state.extraction.sections}
        pageCount={state.extraction.pageCount}
        confidence={state.extraction.confidence}
        onGenerate={onGenerate}
        onSwitchToManual={onSwitchToManual}
        isGenerating={false}
      />
    );
  }

  if (state.status === 'generating') {
    return <PdfGeneratingState />;
  }

  if (state.status === 'error') {
    return (
      <PdfUploadError
        error={state.error}
        code={state.code}
        onRetry={onRetry}
        onBack={onBack}
      />
    );
  }

  const _exhaustiveCheck: never = state;
  throw new Error(
    `PdfCreatePanel reached an unexpected state: ${JSON.stringify(_exhaustiveCheck)}`
  );
}

export function PdfCreatePanel({
  onSwitchToManual,
}: PdfCreatePanelProps): ReactElement {
  const router = useRouter();
  const extraction = usePdfExtraction();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<{
    message: string;
    code?: ErrorCode;
  } | null>(null);

  const isSubmittingRef = useRef(false);
  const planIdRef = useRef<string | undefined>(undefined);
  const cancellationToastShownRef = useRef(false);
  const truncationToastProofRef = useRef<string | null>(null);
  const { startGeneration } = useStreamingPlanGeneration();

  const pageState = useMemo((): PageState => {
    if (isGenerating) {
      return { status: 'generating' };
    }
    if (generationError) {
      return {
        status: 'error',
        error: generationError.message,
        code: generationError.code,
      };
    }
    switch (extraction.state.phase) {
      case 'idle':
        return { status: 'idle' };
      case 'uploading':
        return { status: 'uploading' };
      case 'success':
        return {
          status: 'preview',
          extraction: {
            mainTopic: extraction.state.data.extraction.mainTopic,
            sections: extraction.state.data.extraction.sections,
            pageCount: extraction.state.data.extraction.pageCount,
            confidence: extraction.state.data.extraction.confidence,
            truncation: extraction.state.data.extraction.truncation,
          },
          proof: extraction.state.data.proof,
        };
      case 'error':
        return {
          status: 'error',
          error: extraction.state.message,
          code: extraction.state.code,
        };
    }
  }, [extraction.state, generationError, isGenerating]);

  useEffect(() => {
    if (extraction.state.phase !== 'success') {
      return;
    }
    const notice = extraction.state.notice;
    if (!notice?.truncated) {
      return;
    }
    const token = extraction.state.data.proof.token;
    if (truncationToastProofRef.current === token) {
      return;
    }
    truncationToastProofRef.current = token;
    const summary = truncationReasonsSummary(notice.reasonCodes);
    const message = summary
      ? `Content trimmed: ${summary}. You can still edit the extracted sections before generating.`
      : 'Large PDF content was trimmed for safety. You can still edit the extracted sections before generating.';
    toast.info(message);
  }, [extraction.state]);

  const handleFileSelect = (file: File) => {
    setGenerationError(null);
    truncationToastProofRef.current = null;
    if (!extraction.startExtraction(file)) {
      toast.error('Please select a PDF file');
    }
  };

  const handleCancelUpload = () => {
    if (extraction.cancelExtraction()) {
      toast.info('Upload cancelled');
    }
  };

  const handleGenerate = (editedData: {
    mainTopic: string;
    sections: ExtractionData['sections'];
    settings: PdfPlanSettings;
  }) => {
    if (isGenerating || isSubmittingRef.current) {
      return;
    }

    if (pageState.status !== 'preview') {
      return;
    }

    const { proof } = pageState;

    isSubmittingRef.current = true;
    cancellationToastShownRef.current = false;
    setIsGenerating(true);

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
      setGenerationError({
        message: 'Failed to create learning plan. Please try again.',
      });
      setIsGenerating(false);
      isSubmittingRef.current = false;
      return;
    }

    void startGeneration(payloadResult.payload, {
      onPlanIdReady: (streamPlanId) => {
        planIdRef.current = streamPlanId;
        toast.success('Your learning plan generation has started.');
        router.push(`/plans/${streamPlanId}`);
      },
    })
      .catch((streamError: unknown) => {
        const { handled, message, normalizedError } = handleStreamingPlanError({
          streamError,
          cancellationToastShownRef,
          planIdRef,
          clientLogger,
          toast,
          router,
          redirectPath: '/plans/new',
          logMessage: 'Plan generation failed',
          fallbackMessage: 'Failed to create learning plan. Please try again.',
          onAbort: () => {
            extraction.resetToIdle();
            setGenerationError(null);
            setIsGenerating(false);
          },
        });

        if (handled) {
          return;
        }

        let errorCode: ErrorCode | undefined;
        if (isStreamingError(normalizedError)) {
          errorCode =
            normalizedError.code === 'QUOTA_EXCEEDED'
              ? 'QUOTA_EXCEEDED'
              : undefined;
        }

        setGenerationError({
          message,
          code: errorCode,
        });
      })
      .finally(() => {
        isSubmittingRef.current = false;
        setIsGenerating(false);
      });
  };

  const handleRetry = () => {
    isSubmittingRef.current = false;
    setGenerationError(null);
    setIsGenerating(false);
    extraction.resetToIdle();
  };

  const handleBack = () => {
    isSubmittingRef.current = false;
    setGenerationError(null);
    setIsGenerating(false);
    extraction.resetToIdle();
  };

  return (
    <PdfCreatePanelBody
      state={pageState}
      onFileSelect={handleFileSelect}
      onCancelUpload={handleCancelUpload}
      onGenerate={handleGenerate}
      onSwitchToManual={onSwitchToManual}
      onRetry={handleRetry}
      onBack={handleBack}
    />
  );
}
