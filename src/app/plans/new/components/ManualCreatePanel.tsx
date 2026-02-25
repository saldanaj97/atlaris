'use client';

import { PlanDraftView } from '@/app/plans/[id]/components/PlanDraftView';
import { UnifiedPlanInput } from '@/app/plans/new/components/plan-form';
import {
  deadlineWeeksToDate,
  getTodayDateString,
} from '@/app/plans/new/components/plan-form/helpers';
import type { PlanFormData } from '@/app/plans/new/components/plan-form/types';
import { useStreamingPlanGeneration } from '@/hooks/useStreamingPlanGeneration';
import { clientLogger } from '@/lib/logging/client';
import { mapOnboardingToCreateInput } from '@/lib/mappers/learningPlans';
import type { OnboardingFormValues } from '@/lib/validation/learningPlans';
import { useRouter } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { handleStreamingPlanError } from '@/app/plans/new/components/streamingPlanError';

interface ManualCreatePanelProps {
  initialTopic?: string | null;
  topicResetVersion?: number;
  onTopicUsed?: () => void;
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
        const { handled, message } = handleStreamingPlanError({
          streamError,
          cancellationToastShownRef,
          planIdRef,
          clientLogger,
          toast,
          router,
          logMessage: 'Streaming plan generation failed',
          fallbackMessage:
            'We could not create your learning plan. Please try again.',
        });
        if (handled) {
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
