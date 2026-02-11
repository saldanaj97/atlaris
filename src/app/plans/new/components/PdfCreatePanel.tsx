'use client';

import {
  PdfExtractionPreview,
  type PdfPlanSettings,
} from '@/components/pdf/PdfExtractionPreview';
import {
  PdfUploadError,
  type ErrorCode,
} from '@/components/pdf/PdfUploadError';
import { PdfUploadZone } from '@/components/pdf/PdfUploadZone';
import {
  isStreamingError,
  useStreamingPlanGeneration,
} from '@/hooks/useStreamingPlanGeneration';
import { clientLogger } from '@/lib/logging/client';
import { mapPdfSettingsToCreateInput } from '@/lib/mappers/learningPlans';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

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

export function PdfCreatePanel({
  onSwitchToManual,
}: PdfCreatePanelProps): React.ReactElement {
  const router = useRouter();
  const [state, setState] = useState<PageState>({ status: 'idle' });
  const isSubmittingRef = useRef(false);
  const planIdRef = useRef<string | undefined>(undefined);
  const { startGeneration } = useStreamingPlanGeneration();

  const handleFileSelect = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('Please select a PDF file');
      return;
    }

    setState({ status: 'uploading' });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/v1/plans/from-pdf/extract', {
        method: 'POST',
        body: formData,
      });

      const rawData: unknown = await response.json();
      const parseResult = extractionApiResponseSchema.safeParse(rawData);

      if (!parseResult.success) {
        clientLogger.error('PDF extraction response validation failed', {
          error: parseResult.error.flatten(),
          responseOk: response.ok,
        });
        setState({
          status: 'error',
          error: 'Invalid response from server. Please try again.',
        });
        return;
      }

      const data: ExtractionApiResponse = parseResult.data;

      if (!response.ok || !data.success || !data.extraction || !data.proof) {
        setState({
          status: 'error',
          error: data.error ?? 'Failed to extract PDF content',
          code: (data.code as ErrorCode) ?? undefined,
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
        },
        proof: data.proof,
      });
    } catch (error) {
      clientLogger.error('PDF extraction failed', error);
      setState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  };

  const handleGenerate = async (editedData: {
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

    const { mainTopic, sections, settings } = editedData;
    const { skillLevel, weeklyHours, learningStyle, deadlineWeeks } = settings;

    try {
      const createInput = mapPdfSettingsToCreateInput({
        mainTopic,
        sections,
        skillLevel,
        weeklyHours,
        learningStyle,
        deadlineWeeks,
        pdfProofToken: proof.token,
        pdfExtractionHash: proof.extractionHash,
      });
      const streamPlanId = await startGeneration(createInput);

      planIdRef.current = streamPlanId;
      toast.success('Your learning plan is ready!');
      router.push(`/plans/${streamPlanId}`);
    } catch (streamError) {
      const isAbort =
        streamError instanceof DOMException &&
        streamError.name === 'AbortError';
      if (isAbort) {
        toast.info('Generation cancelled');
        setState({ status: 'idle' });
        return;
      }

      clientLogger.error('Plan generation failed', streamError);

      const message =
        streamError instanceof Error
          ? streamError.message
          : 'Failed to create learning plan. Please try again.';

      const extractedPlanId = isStreamingError(streamError)
        ? (streamError.planId ?? streamError.data?.planId ?? planIdRef.current)
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

      const errorCode = isStreamingError(streamError)
        ? streamError.code === 'QUOTA_EXCEEDED'
          ? ('QUOTA_EXCEEDED' as ErrorCode)
          : undefined
        : undefined;

      setState({
        status: 'error',
        error: message,
        code: errorCode,
      });
    } finally {
      isSubmittingRef.current = false;
    }
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
