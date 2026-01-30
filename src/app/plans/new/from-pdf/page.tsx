'use client';

import {
  deadlineWeeksToDate,
  getTodayDateString,
} from '@/app/plans/new/components/plan-form/helpers';
import { MouseGlowContainer } from '@/components/effects/MouseGlow';
import { PdfExtractionPreview } from '@/components/pdf/PdfExtractionPreview';
import { PdfUploadError } from '@/components/pdf/PdfUploadError';
import { PdfUploadZone } from '@/components/pdf/PdfUploadZone';
import { clientLogger } from '@/lib/logging/client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

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
  code?: string;
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
  | { status: 'error'; error: string; code?: string };

/**
 * Create Plan from PDF Page
 *
 * Upload PDF → Extract content → Preview/Edit → Generate learning plan.
 * Features glassmorphism design matching the manual plan creation flow.
 */
export default function CreatePlanFromPdfPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>({ status: 'idle' });

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
  }) => {
    setState({ status: 'generating' });

    try {
      const response = await fetch('/api/v1/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: 'pdf',
          extractedContent: {
            mainTopic: editedData.mainTopic,
            sections: editedData.sections,
          },
          skillLevel: 'beginner',
          weeklyHours: '3-5',
          learningStyle: 'mixed',
          startDate: getTodayDateString(),
          deadlineDate: deadlineWeeksToDate('4'),
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
    setState({ status: 'idle' });
  };

  const handleBack = () => {
    setState({ status: 'idle' });
  };

  return (
    <MouseGlowContainer className="from-accent/30 via-primary/10 to-accent/20 dark:bg-background fixed inset-0 overflow-hidden bg-gradient-to-br dark:from-transparent dark:via-transparent dark:to-transparent">
      <div
        className="from-primary/30 to-accent/20 absolute top-20 -left-20 h-96 w-96 rounded-full bg-gradient-to-br opacity-60 blur-3xl dark:opacity-30"
        aria-hidden="true"
      />
      <div
        className="from-primary/30 to-accent/20 absolute top-40 -right-20 h-80 w-80 rounded-full bg-gradient-to-br opacity-60 blur-3xl dark:opacity-30"
        aria-hidden="true"
      />
      <div
        className="from-primary/20 to-accent/15 absolute bottom-20 left-1/3 h-72 w-72 rounded-full bg-gradient-to-br opacity-60 blur-3xl dark:opacity-30"
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full flex-col items-center justify-center overflow-y-auto px-6 py-8">
        <div className="mb-8 text-center">
          <div className="dark:border-border dark:bg-card/50 border-primary/30 mb-4 inline-flex items-center rounded-full border bg-white/50 px-4 py-2 shadow-lg backdrop-blur-sm">
            <span className="from-primary to-accent mr-2 h-2 w-2 rounded-full bg-gradient-to-r" />
            <span className="text-primary text-sm font-medium">
              Generate from PDF
            </span>
          </div>

          <h1 className="text-foreground mb-3 text-4xl font-bold tracking-tight md:text-5xl">
            Upload your{' '}
            <span className="from-primary via-accent to-primary bg-gradient-to-r bg-clip-text text-transparent">
              learning material
            </span>
          </h1>

          <p className="text-muted-foreground mx-auto max-w-xl text-lg">
            Upload a PDF document and we&apos;ll extract the key topics to
            create a personalized learning plan.
          </p>
        </div>

        {state.status === 'idle' && (
          <PdfUploadZone
            onFileSelect={(file) => {
              void handleFileSelect(file);
            }}
            isUploading={false}
            disabled={false}
          />
        )}

        {state.status === 'uploading' && (
          <PdfUploadZone
            onFileSelect={(file) => {
              void handleFileSelect(file);
            }}
            isUploading={true}
            disabled={true}
          />
        )}

        {state.status === 'preview' && (
          <PdfExtractionPreview
            mainTopic={state.extraction.mainTopic}
            sections={state.extraction.sections}
            pageCount={state.extraction.pageCount}
            confidence={state.extraction.confidence}
            onGenerate={(editedData) => {
              void handleGenerate(editedData);
            }}
            isGenerating={false}
          />
        )}

        {state.status === 'generating' && (
          <div className="w-full max-w-3xl">
            <div className="dark:border-border dark:bg-card/60 border-border bg-card/60 relative rounded-3xl border px-6 py-12 shadow-2xl backdrop-blur-xl">
              <div className="flex flex-col items-center text-center">
                <div className="from-primary to-accent mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
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
        )}

        {state.status === 'error' && (
          <PdfUploadError
            error={state.error}
            code={state.code}
            onRetry={handleRetry}
            onBack={handleBack}
          />
        )}
      </div>
    </MouseGlowContainer>
  );
}
