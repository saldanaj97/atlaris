'use client';

import { PlanDraftView } from '@/app/plans/[id]/components/PlanDraftView';
import { UnifiedPlanInput } from '@/app/plans/new/components/plan-form';
import {
  deadlineWeeksToDate,
  getTodayDateString,
} from '@/app/plans/new/components/plan-form/helpers';
import type { PlanFormData } from '@/app/plans/new/components/plan-form/types';
import {
  isStreamingError,
  useStreamingPlanGeneration,
} from '@/hooks/useStreamingPlanGeneration';
import { isAbortError, normalizeThrown } from '@/lib/errors';
import { clientLogger } from '@/lib/logging/client';
import { mapOnboardingToCreateInput } from '@/lib/mappers/learningPlans';
import type { OnboardingFormValues } from '@/lib/validation/learningPlans';
import { useRouter } from 'next/navigation';
import React, {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import {
  CreateMethodToggle,
  type CreateMethod,
} from '@/app/plans/new/components/CreateMethodToggle';

const PdfCreatePanel = React.lazy(() =>
  import('@/app/plans/new/components/PdfCreatePanel').then((module) => ({
    default: module.PdfCreatePanel,
  }))
);

interface ManualCreatePanelProps {
  initialTopic?: string | null;
  topicResetVersion?: number;
  onTopicUsed?: () => void;
}

interface CreatePlanPageClientProps {
  initialMethod: CreateMethod;
  initialTopic?: string | null;
  initialTopicResetVersion?: number;
}

type MappingResult =
  | { ok: true; payload: ReturnType<typeof mapOnboardingToCreateInput> }
  | { ok: false; error: unknown };

function buildCreatePayload(data: PlanFormData): MappingResult {
  try {
    const onboardingValues = convertToOnboardingValues(data);
    return {
      ok: true,
      payload: mapOnboardingToCreateInput(onboardingValues),
    };
  } catch (error) {
    return { ok: false, error };
  }
}

function convertToOnboardingValues(data: PlanFormData): OnboardingFormValues {
  return {
    topic: data.topic,
    skillLevel: data.skillLevel,
    weeklyHours: data.weeklyHours,
    learningStyle: data.learningStyle,
    notes: undefined,
    startDate: getTodayDateString(),
    deadlineDate: deadlineWeeksToDate(data.deadlineWeeks),
  };
}

/**
 * ManualCreatePanel handles manual plan creation, streams generation progress,
 * and routes to the created plan on success. Manages form submission, streaming
 * state, and error handling with cancellation support.
 */
export function ManualCreatePanel({
  initialTopic,
  topicResetVersion = 0,
  onTopicUsed,
}: ManualCreatePanelProps): React.ReactElement {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    state: streamingState,
    startGeneration,
    cancel: cancelStreaming,
  } = useStreamingPlanGeneration();

  const planIdRef = useRef<string | undefined>(undefined);
  const cancellationToastShownRef = useRef(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    planIdRef.current = streamingState.planId;
  }, [streamingState.planId]);

  useEffect(() => {
    if (streamingState.status === 'idle') {
      cancellationToastShownRef.current = false;
    }
  }, [streamingState.status]);

  const handleSubmit = (data: PlanFormData) => {
    if (isSubmittingRef.current) {
      return;
    }

    const mappingResult = buildCreatePayload(data);
    if (!mappingResult.ok) {
      clientLogger.error('Failed to map form values', mappingResult.error);
      toast.error('Please double-check the form and try again.');
      return;
    }

    onTopicUsed?.();

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    void startGeneration(mappingResult.payload)
      .then((planId) => {
        toast.success('Your learning plan is ready!');
        router.push(`/plans/${planId}`);
      })
      .catch((streamError: unknown) => {
        if (isAbortError(streamError)) {
          if (!cancellationToastShownRef.current) {
            toast.info('Generation cancelled');
            cancellationToastShownRef.current = true;
          }
          return;
        }

        clientLogger.error('Streaming plan generation failed', streamError);

        const normalizedError = normalizeThrown(streamError);
        const message =
          normalizedError instanceof Error
            ? normalizedError.message
            : 'We could not create your learning plan. Please try again.';

        const extractedPlanId = isStreamingError(normalizedError)
          ? (normalizedError.planId ??
            normalizedError.data?.planId ??
            planIdRef.current)
          : planIdRef.current;

        if (typeof extractedPlanId === 'string' && extractedPlanId.length > 0) {
          toast.error('Generation failed. You can retry from the plan page.');
          router.push(`/plans/${extractedPlanId}`);
          return;
        }

        toast.error(message);
      })
      .finally(() => {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      });
  };

  return (
    <>
      <UnifiedPlanInput
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        initialTopic={initialTopic ?? undefined}
        topicResetVersion={topicResetVersion}
      />

      {streamingState.status !== 'idle' && (
        <div className="mt-8 w-full max-w-2xl">
          <PlanDraftView
            state={streamingState}
            onCancel={() => {
              cancelStreaming();
              setIsSubmitting(false);
              if (!cancellationToastShownRef.current) {
                toast.info('Generation cancelled');
                cancellationToastShownRef.current = true;
              }
            }}
          />
        </div>
      )}
    </>
  );
}

export function CreatePlanPageClient({
  initialMethod,
  initialTopic,
  initialTopicResetVersion = 0,
}: CreatePlanPageClientProps): React.ReactElement {
  const router = useRouter();
  const panelIdBase = useId();
  const tabIdBase = useId();
  const manualPanelId = `${panelIdBase}-manual-panel`;
  const pdfPanelId = `${panelIdBase}-pdf-panel`;
  const manualTabId = `${tabIdBase}-manual-tab`;
  const pdfTabId = `${tabIdBase}-pdf-tab`;
  const currentMethod = initialMethod;
  const [prefillTopic, setPrefillTopic] = useState<string | null>(
    initialTopic ?? null
  );
  const [topicResetVersion, setTopicResetVersion] = useState(
    initialTopicResetVersion
  );

  const handleMethodChange = useCallback(
    (method: CreateMethod) => {
      const targetUrl =
        method === 'manual' ? '/plans/new' : '/plans/new?method=pdf';
      router.push(targetUrl, { scroll: false });
    },
    [router]
  );

  const handleSwitchToManual = useCallback(
    (extractedTopic: string) => {
      setPrefillTopic(extractedTopic);
      setTopicResetVersion((currentVersion) => currentVersion + 1);
      router.push('/plans/new', { scroll: false });
    },
    [router]
  );

  const handleTopicUsed = useCallback(() => {
    setPrefillTopic(null);
  }, []);

  return (
    <>
      <div className="mb-8 text-center">
        <div className="dark:border-border dark:bg-card/50 border-primary/30 mb-4 inline-flex items-center rounded-full border bg-white/50 px-4 py-2 shadow-lg backdrop-blur-sm">
          <span className="from-primary to-accent mr-2 h-2 w-2 rounded-full bg-gradient-to-r" />
          <span className="text-primary text-sm font-medium">
            AI-Powered Learning Plans
          </span>
        </div>

        <h1 className="text-foreground mb-3 text-4xl font-bold tracking-tight md:text-5xl">
          What do you want to{' '}
          <span className="from-primary via-accent to-primary bg-gradient-to-r bg-clip-text text-transparent">
            learn?
          </span>
        </h1>

        <p className="text-muted-foreground mx-auto max-w-xl text-lg">
          {currentMethod === 'manual'
            ? "Describe your learning goal. We'll create a personalized, time-blocked schedule that syncs to your calendar."
            : "Upload a PDF document and we'll extract the key topics to create a personalized learning plan."}
        </p>
      </div>

      <div className="mb-8">
        <CreateMethodToggle
          value={currentMethod}
          onChange={handleMethodChange}
          manualPanelId={manualPanelId}
          pdfPanelId={pdfPanelId}
          manualTabId={manualTabId}
          pdfTabId={pdfTabId}
        />
      </div>

      {currentMethod === 'manual' ? (
        <div id={manualPanelId} role="tabpanel" aria-labelledby={manualTabId}>
          <ManualCreatePanel
            initialTopic={prefillTopic}
            topicResetVersion={topicResetVersion}
            onTopicUsed={handleTopicUsed}
          />
        </div>
      ) : (
        <div id={pdfPanelId} role="tabpanel" aria-labelledby={pdfTabId}>
          <Suspense
            fallback={
              <div className="text-muted-foreground text-center text-sm">
                Loading PDF options...
              </div>
            }
          >
            <PdfCreatePanel onSwitchToManual={handleSwitchToManual} />
          </Suspense>
        </div>
      )}
    </>
  );
}
