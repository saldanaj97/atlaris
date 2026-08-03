'use client';

import type { PlanFormData } from '@/app/(app)/plans/new/components/plan-form/types';

import { planDetailPath, ROUTES } from '@/features/navigation/routes';
import {
  buildCreatePlanPayloadFromForm,
  planFormPayloadErrorMessage,
} from '@/features/plans/plan-form-payload';
import { usePlanGenerationSession } from '@/features/plans/session/usePlanGenerationSession';
import { isAbortError, normalizeThrown } from '@/lib/errors';
import { clientLogger } from '@/lib/logging/client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const GENERATION_STARTED_TOAST =
  'Your learning plan generation has started.' as const;
const GENERATION_FAILED_FALLBACK =
  'We could not create your learning plan. Please try again.' as const;

type PlanGenerationError = ReturnType<typeof normalizeThrown> & {
  planId?: string;
  data?: { planId?: string };
  code?: string;
};

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
    startSession,
  } = usePlanGenerationSession();

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

  const submit = (data: PlanFormData): void => {
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

    void startSession(
      { kind: 'create', input: mappingResult.payload },
      {
        onPlanIdReady: (readyPlanId) => {
          toast.success(GENERATION_STARTED_TOAST);
          router.push(planDetailPath(readyPlanId));
        },
      },
    )
      .catch((streamError: unknown) => {
        const error = normalizeThrown(streamError) as PlanGenerationError;

        if (isAbortError(error)) {
          if (!cancellationToastShownRef.current) {
            toast.info('Generation cancelled');
            cancellationToastShownRef.current = true;
          }
          return;
        }

        if (error.code === 'AUTH_REQUIRED') {
          toast.error('Please sign in to create a learning plan.');
          router.push(
            `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(ROUTES.PLANS.NEW)}`,
          );
          return;
        }

        clientLogger.error('Streaming plan generation failed', streamError);

        const message =
          error instanceof Error ? error.message : GENERATION_FAILED_FALLBACK;
        const failedPlanId =
          error.planId ?? error.data?.planId ?? planIdRef.current;

        if (failedPlanId) {
          toast.error('Generation failed. You can retry from the plan page.');
          router.push(planDetailPath(failedPlanId));
          return;
        }

        toast.error(message);
      })
      .finally(() => {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      });
  };

  return { isSubmitting, submit };
}
