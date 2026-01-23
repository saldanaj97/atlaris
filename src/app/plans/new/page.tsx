'use client';

import { PlanDraftView } from '@/app/plans/[id]/components/PlanDraftView';
import { UnifiedPlanInput } from '@/app/plans/new/components/plan-form';
import {
  deadlineWeeksToDate,
  getTodayDateString,
} from '@/app/plans/new/components/plan-form/helpers';
import { MouseGlowContainer } from '@/components/effects/MouseGlow';
import { useStreamingPlanGeneration } from '@/hooks/useStreamingPlanGeneration';
import { clientLogger } from '@/lib/logging/client';
import { mapOnboardingToCreateInput } from '@/lib/mappers/learningPlans';
import type { OnboardingFormValues } from '@/lib/validation/learningPlans';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { PlanFormData } from '@/app/plans/new/components/plan-form/types';
import type { StreamingError } from '@/hooks/useStreamingPlanGeneration';

/**
 * Converts the unified form data to the OnboardingFormValues format
 * expected by the existing mapper.
 */
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
 * Create New Plan Page
 *
 * Modern unified input experience for generating learning plans.
 * Features glassmorphism design matching the landing page aesthetic.
 *
 * TODO: Add in proper testing for this page since we moved from using OnboardingForm to UnifiedPlanInput
 */
export default function CreateNewPlanPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    state: streamingState,
    startGeneration,
    cancel: cancelStreaming,
  } = useStreamingPlanGeneration();

  // Ref to track the latest planId to avoid stale closure issues in error handlers
  const planIdRef = useRef<string | undefined>(undefined);
  // Ref to track if cancellation toast has been shown to prevent duplicates
  const cancellationToastShownRef = useRef(false);

  // Sync planIdRef with streamingState.planId
  useEffect(() => {
    planIdRef.current = streamingState.planId;
  }, [streamingState.planId]);

  // Reset cancellation toast flag when starting a new generation
  useEffect(() => {
    if (streamingState.status === 'idle') {
      cancellationToastShownRef.current = false;
    }
  }, [streamingState.status]);

  const handleSubmit = async (data: PlanFormData) => {
    let payload: ReturnType<typeof mapOnboardingToCreateInput>;
    try {
      // Convert the unified form data to the existing format
      // This conversion includes deadlineWeeksToDate which can throw for invalid values
      const onboardingValues = convertToOnboardingValues(data);
      payload = mapOnboardingToCreateInput(onboardingValues);
    } catch (error) {
      clientLogger.error('Failed to map form values', error);
      toast.error('Please double-check the form and try again.');
      return;
    }

    setIsSubmitting(true);
    try {
      const planId = await startGeneration(payload);
      toast.success('Your learning plan is ready!');
      router.push(`/plans/${planId}`);
    } catch (streamError) {
      const isAbort =
        streamError instanceof DOMException &&
        streamError.name === 'AbortError';
      if (isAbort) {
        // Only show toast if it hasn't been shown already (e.g., from onCancel handler)
        if (!cancellationToastShownRef.current) {
          toast.info('Generation cancelled');
          cancellationToastShownRef.current = true;
        }
        return;
      }

      clientLogger.error('Streaming plan generation failed', streamError);

      const errorWithStatus = streamError as StreamingError;
      const message =
        streamError instanceof Error
          ? streamError.message
          : 'We could not create your learning plan. Please try again.';

      // Attempt to extract planId: (1) from error payload, (2) from ref tracking latest state
      const extractedPlanId =
        errorWithStatus.planId ??
        errorWithStatus.data?.planId ??
        planIdRef.current;

      // If plan was created but generation failed, redirect to plan page
      // The plan page will show the failed state with a retry button
      if (
        (errorWithStatus.status === 200 || extractedPlanId) &&
        typeof extractedPlanId === 'string' &&
        extractedPlanId.length > 0
      ) {
        toast.error('Generation failed. You can retry from the plan page.');
        router.push(`/plans/${extractedPlanId}`);
        return;
      }

      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MouseGlowContainer className="from-accent/30 via-primary/10 to-accent/20 dark:bg-background fixed inset-0 overflow-hidden bg-gradient-to-br dark:from-transparent dark:via-transparent dark:to-transparent">
      {/* Floating gradient orbs - matching landing page */}
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
        {/* Header */}
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
            Describe your learning goal. We&apos;ll create a personalized,
            time-blocked schedule that syncs to your calendar.
          </p>
        </div>

        {/* Unified Input Component */}
        <UnifiedPlanInput
          onSubmit={(data) => {
            void handleSubmit(data);
          }}
          isSubmitting={isSubmitting}
        />

        {/* Streaming Draft View */}
        {streamingState.status !== 'idle' && (
          <div className="mt-8 w-full max-w-2xl">
            <PlanDraftView
              state={streamingState}
              onCancel={() => {
                cancelStreaming();
                setIsSubmitting(false);
                // Show cancellation toast immediately when user clicks cancel
                if (!cancellationToastShownRef.current) {
                  toast.info('Generation cancelled');
                  cancellationToastShownRef.current = true;
                }
              }}
            />
          </div>
        )}
      </div>
    </MouseGlowContainer>
  );
}
