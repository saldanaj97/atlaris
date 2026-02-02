'use client';

import {
  deadlineWeeksToDate,
  getTodayDateString,
} from '@/app/plans/new/components/plan-form/helpers';
import {
  PdfExtractionPreview,
  type PdfPlanSettings,
} from '@/components/pdf/PdfExtractionPreview';
import {
  PdfUploadError,
  type ErrorCode,
} from '@/components/pdf/PdfUploadError';
import { PdfUploadZone } from '@/components/pdf/PdfUploadZone';
import { clientLogger } from '@/lib/logging/client';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

interface PdfCreatePanelProps {
  onSwitchToManual: (extractedTopic: string) => void;
}

interface ExtractionApiResponse {
  success: boolean;
  extraction?: {
    text: string;
    pageCount: number;
    metadata: { title?: string; author?: string; subject?: string };
    structure: {
      sections: Array<{
        title: string;
        content: string;
        level: number;
        suggestedTopic?: string;
      }>;
      suggestedMainTopic: string;
      confidence: 'high' | 'medium' | 'low';
    };
  };
  error?: string;
  code?: ErrorCode;
}

interface PlanCreationApiResponse {
  id?: string;
  error?: string;
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

type PageState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'preview'; extraction: ExtractionData }
  | { status: 'generating' }
  | { status: 'error'; error: string; code?: ErrorCode };

export function PdfCreatePanel({
  onSwitchToManual,
}: PdfCreatePanelProps): React.ReactElement {
  const router = useRouter();
  const [state, setState] = useState<PageState>({ status: 'idle' });
  const isSubmittingRef = useRef(false);

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

      const data = (await response.json()) as ExtractionApiResponse;

      if (!response.ok || !data.success || !data.extraction) {
        setState({
          status: 'error',
          error: data.error ?? 'Failed to extract PDF content',
          code: data.code,
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
    isSubmittingRef.current = true;
    setState({ status: 'generating' });

    const { mainTopic, sections, settings } = editedData;
    const { skillLevel, weeklyHours, learningStyle, deadlineWeeks } = settings;

    try {
      const response = await fetch('/api/v1/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'pdf',
          extractedContent: {
            mainTopic,
            sections,
          },
          skillLevel,
          weeklyHours,
          learningStyle,
          startDate: getTodayDateString(),
          deadlineDate: deadlineWeeksToDate(deadlineWeeks),
        }),
      });

      const data = (await response.json()) as PlanCreationApiResponse;

      if (!response.ok) {
        if (response.status === 403 && data.error?.includes('quota')) {
          setState({
            status: 'error',
            error: data.error,
            code: 'QUOTA_EXCEEDED',
          });
          return;
        }

        throw new Error(data.error ?? 'Failed to create learning plan');
      }

      if (!data.id) {
        throw new Error('Plan ID not returned from API');
      }

      toast.success('Learning plan created! Generation starting...');
      router.push(`/plans/${data.id}`);
    } catch (error) {
      isSubmittingRef.current = false;
      clientLogger.error('Plan generation failed', error);
      setState({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to create learning plan',
      });
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
