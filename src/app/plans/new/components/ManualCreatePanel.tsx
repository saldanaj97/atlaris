'use client';

import { PlanDraftView } from '@/app/plans/[id]/components/PlanDraftView';
import { UnifiedPlanInput } from '@/app/plans/new/components/plan-form';
import {
  deadlineWeeksToDate,
  getTodayDateString,
} from '@/app/plans/new/components/plan-form/helpers';
import type { PlanFormData } from '@/app/plans/new/components/plan-form/types';
import type { StreamingError } from '@/hooks/useStreamingPlanGeneration';
import { useStreamingPlanGeneration } from '@/hooks/useStreamingPlanGeneration';
import { clientLogger } from '@/lib/logging/client';
import { mapOnboardingToCreateInput } from '@/lib/mappers/learningPlans';
import type { OnboardingFormValues } from '@/lib/validation/learningPlans';
import { useRouter } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface ManualCreatePanelProps {
  initialTopic?: string | null;
  onTopicUsed?: () => void;
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

export function ManualCreatePanel({
  initialTopic,
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

  useEffect(() => {
    planIdRef.current = streamingState.planId;
  }, [streamingState.planId]);

  useEffect(() => {
    if (streamingState.status === 'idle') {
      cancellationToastShownRef.current = false;
    }
  }, [streamingState.status]);

  const handleSubmit = async (data: PlanFormData) => {
    let payload: ReturnType<typeof mapOnboardingToCreateInput>;
    try {
      const onboardingValues = convertToOnboardingValues(data);
      payload = mapOnboardingToCreateInput(onboardingValues);
    } catch (error) {
      clientLogger.error('Failed to map form values', error);
      toast.error('Please double-check the form and try again.');
      return;
    }

    onTopicUsed?.();

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

      const extractedPlanId =
        errorWithStatus.planId ??
        errorWithStatus.data?.planId ??
        planIdRef.current;

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
    <>
      <UnifiedPlanInput
        onSubmit={(data) => {
          void handleSubmit(data);
        }}
        isSubmitting={isSubmitting}
        initialTopic={initialTopic ?? undefined}
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
