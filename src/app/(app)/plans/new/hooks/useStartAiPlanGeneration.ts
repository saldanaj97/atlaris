'use client';

import type { PlanFormData } from '@/app/(app)/plans/new/components/plan-form/types';

import { planDetailPath, ROUTES } from '@/features/navigation/routes';
import {
  buildCreatePlanPayloadFromForm,
  planFormPayloadErrorMessage,
} from '@/features/plans/plan-form-payload';
import { handleStreamingPlanError } from '@/features/plans/session/streaming-plan-error';
import { useStreamingPlanGeneration } from '@/hooks/useStreamingPlanGeneration';
import { clientLogger } from '@/lib/logging/client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const GENERATION_STARTED_TOAST =
  'Your learning plan generation has started.' as const;
const GENERATION_FAILED_FALLBACK =
  'We could not create your learning plan. Please try again.' as const;

/**
 * Submits the create-plan form, streams AI generation, and navigates to the
 * plan detail page when a plan id is ready (generation continues on that page).
 */
export function useStartAiPlanGeneration(): {
  isSubmitting: boolean;
  submit: (data: PlanFormData) => void;
} {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    state: { planId, status },
    startGeneration,
  } = useStreamingPlanGeneration();

  const planIdRef = useRef<string | undefined>(undefined);
  const cancellationToastShownRef = useRef(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    planIdRef.current = planId;
  }, [planId]);

  useEffect(() => {
    if (status === 'idle') {
      cancellationToastShownRef.current = false;
    }
  }, [status]);

  const submit = useCallback(
    (data: PlanFormData) => {
      if (isSubmittingRef.current) {
        return;
      }

      const mappingResult = buildCreatePlanPayloadFromForm(data);
      if (!mappingResult.ok) {
        clientLogger.error('Failed to map form values', mappingResult.error);
        toast.error(planFormPayloadErrorMessage(mappingResult.error));
        return;
      }

      isSubmittingRef.current = true;
      setIsSubmitting(true);

      void startGeneration(mappingResult.payload, {
        onPlanIdReady: (readyPlanId) => {
          toast.success(GENERATION_STARTED_TOAST);
          router.push(planDetailPath(readyPlanId));
        },
      })
        .catch((streamError: unknown) => {
          const { handled, message } = handleStreamingPlanError({
            streamError,
            cancellationToastShownRef,
            planIdRef,
            clientLogger,
            toast,
            router,
            redirectPath: ROUTES.PLANS.NEW,
            logMessage: 'Streaming plan generation failed',
            fallbackMessage: GENERATION_FAILED_FALLBACK,
          });
          if (!handled) {
            toast.error(message);
          }
        })
        .finally(() => {
          isSubmittingRef.current = false;
          setIsSubmitting(false);
        });
    },
    [router, startGeneration],
  );

  return { isSubmitting, submit };
}
