'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useStreamingPlanGeneration } from '@/hooks/useStreamingPlanGeneration';
import { clientLogger } from '@/lib/logging/client';
import { mapOnboardingToCreateInput } from '@/lib/mappers/learningPlans';
import type { OnboardingFormValues } from '@/lib/validation/learningPlans';

import { PlanDraftView } from '@/app/plans/components/PlanDraftView';
import {
  deadlineWeeksToDate,
  getTodayDateString,
  UnifiedPlanInput,
  type PlanFormData,
} from '@/app/plans/new/components/plan-form';

interface StreamingError extends Error {
  status?: number;
  planId?: string;
  data?: { planId?: string };
}

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

  // Sync planIdRef with streamingState.planId
  useEffect(() => {
    planIdRef.current = streamingState.planId;
  }, [streamingState.planId]);

  const handleSubmit = async (data: PlanFormData) => {
    // Convert the unified form data to the existing format
    const onboardingValues = convertToOnboardingValues(data);

    let payload: ReturnType<typeof mapOnboardingToCreateInput>;
    try {
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
        (streamError as DOMException | undefined)?.name === 'AbortError';
      if (isAbort) {
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
    <div className="fixed inset-0 overflow-hidden bg-gradient-to-br from-rose-100 via-purple-50 to-cyan-100">
      {/* Floating gradient orbs - matching landing page */}
      <div
        className="absolute top-20 -left-20 h-96 w-96 rounded-full bg-gradient-to-br from-purple-300 to-pink-200 opacity-60 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute top-40 -right-20 h-80 w-80 rounded-full bg-gradient-to-br from-cyan-200 to-blue-200 opacity-60 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="absolute bottom-20 left-1/3 h-72 w-72 rounded-full bg-gradient-to-br from-rose-200 to-orange-100 opacity-60 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full flex-col items-center justify-center overflow-y-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center rounded-full border border-purple-200/50 bg-white/50 px-4 py-2 shadow-lg backdrop-blur-sm">
            <span className="mr-2 h-2 w-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
            <span className="text-sm font-medium text-purple-700">
              AI-Powered Learning Plans
            </span>
          </div>

          <h1 className="mb-3 text-4xl font-bold tracking-tight text-gray-900 md:text-5xl">
            What do you want to{' '}
            <span className="bg-gradient-to-r from-purple-600 via-pink-500 to-rose-500 bg-clip-text text-transparent">
              learn?
            </span>
          </h1>

          <p className="mx-auto max-w-xl text-lg text-gray-600">
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
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
