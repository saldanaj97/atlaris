import type { ModuleLessonGenerationApiResponse } from '@/shared/types/lesson-content.types';

import { clientLogger } from '@/lib/logging/client';
import {
  ModuleLessonGenerationApiResponseSchema,
  ModuleLessonGenerationStatusResponseSchema,
} from '@/shared/schemas/lesson-content.schemas';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

const MODULE_LESSON_GENERATION_POLL_MS = 2500;
const MODULE_LESSON_GENERATION_MAX_POLLS = 20;
const MODULE_LESSON_GENERATION_MAX_POLL_MS = 60_000;
const MODULE_LESSON_GENERATION_STATUS_TIMEOUT_MS = 10_000;

type LongGenerationKey = {
  planId: string;
  moduleId: string;
  workflowRunId?: string;
};

function applyModuleLessonGenerationResponse(
  body: ModuleLessonGenerationApiResponse,
  params: {
    markFailed: () => void;
    markGenerating: (workflowRunId?: string) => void;
    refresh: () => void;
  },
): void {
  const { markFailed, markGenerating, refresh } = params;

  switch (body.state) {
    case 'provider_failure':
      markFailed();
      toast.error('Lesson generation failed. Please try again.');
      return;
    case 'locked':
      markFailed();
      toast.error('Lesson generation is not available for this module.');
      return;
    case 'disabled':
      markFailed();
      toast.error('Lesson generation is temporarily unavailable.');
      return;
    case 'not_found':
      markFailed();
      toast.error('Plan or module was not found.');
      return;
    case 'generating':
      markGenerating(body.workflowRunId);
      refresh();
      return;
    case 'ready':
      refresh();
      return;
    default: {
      const _exhaustive: never = body;
      return _exhaustive;
    }
  }
}

export function useModuleLessonGeneration({
  planId,
  moduleId,
  status,
}: {
  planId: string;
  moduleId: string;
  status: 'not_generated' | 'generating' | 'ready' | 'failed';
}) {
  const { refresh } = useRouter();
  const [isPending, startTransition] = useTransition();
  const generationKey = `${planId}:${moduleId}`;
  const [localFailureKey, setLocalFailureKey] = useState<string | null>(null);
  const [requestedGenerationKey, setRequestedGenerationKey] =
    useState<LongGenerationKey | null>(null);
  const [longGenerationKey, setLongGenerationKey] =
    useState<LongGenerationKey | null>(null);
  const generationPollCountRef = useRef(0);
  // Distinguishes pre-claim queue latency from post-claim terminal rollbacks.
  const hasObservedGeneratingRef = useRef(false);
  const autoStartedKeyRef = useRef<string | null>(null);
  const generationRequested =
    requestedGenerationKey?.planId === planId &&
    requestedGenerationKey.moduleId === moduleId;
  const requestedWorkflowRunId = requestedGenerationKey?.workflowRunId;
  const generationTakingLong =
    (status === 'generating' ||
      status === 'not_generated' ||
      generationRequested) &&
    longGenerationKey?.planId === planId &&
    longGenerationKey.moduleId === moduleId;

  useEffect(() => {
    if (status === 'generating') {
      hasObservedGeneratingRef.current = true;
    }

    if (status !== 'generating' && !generationRequested) {
      generationPollCountRef.current = 0;
      return;
    }

    generationPollCountRef.current = 0;

    let cancelled = false;
    let timeoutId: number | undefined;
    const abortController = new AbortController();
    const statusUrl = `/api/v1/plans/${planId}/modules/${moduleId}/lesson-content/status`;

    const pollStatus = async (): Promise<
      'continue' | 'terminal' | 'error' | 'aborted'
    > => {
      const requestTimeoutSignal = AbortSignal.timeout(
        MODULE_LESSON_GENERATION_STATUS_TIMEOUT_MS,
      );
      try {
        const response = await fetch(statusUrl, {
          cache: 'no-store',
          signal: AbortSignal.any([
            abortController.signal,
            requestTimeoutSignal,
          ]),
        });

        if (!response.ok) {
          clientLogger.error('Module lesson generation status request failed', {
            moduleId,
            planId,
            ok: response.ok,
            status: response.status,
          });
          return 'error';
        }

        let raw: unknown;
        try {
          raw = await response.json();
        } catch (parseError) {
          clientLogger.error(
            'Module lesson generation status response JSON parse failed',
            {
              parseError,
              moduleId,
              planId,
              ok: response.ok,
              status: response.status,
            },
          );
          return 'error';
        }

        const parsed =
          ModuleLessonGenerationStatusResponseSchema.safeParse(raw);
        if (!parsed.success) {
          clientLogger.error(
            'Module lesson generation status response validation failed',
            {
              issues: parsed.error.flatten(),
              moduleId,
              planId,
              ok: response.ok,
              status: response.status,
            },
          );
          return 'error';
        }

        if (parsed.data.status === 'generating') {
          hasObservedGeneratingRef.current = true;
          return 'continue';
        }

        // A matching workflow run proves the queued request claimed and settled.
        // Otherwise, wait for a visible claim before treating it as terminal.
        if (
          generationRequested &&
          (parsed.data.status === 'not_generated' ||
            parsed.data.status === 'failed')
        ) {
          if (
            requestedWorkflowRunId !== undefined &&
            requestedWorkflowRunId === parsed.data.workflowRunId
          ) {
            return 'terminal';
          }

          if (!hasObservedGeneratingRef.current) {
            return 'continue';
          }
        }

        return 'terminal';
      } catch (error) {
        if (abortController.signal.aborted) {
          return 'aborted';
        }

        clientLogger.error('Module lesson generation status request failed', {
          error,
          timedOut: requestTimeoutSignal.aborted,
          moduleId,
          planId,
        });
        return 'error';
      }
    };

    const schedule = (): void => {
      timeoutId = window.setTimeout(
        () => {
          void (async () => {
            if (cancelled) return;

            generationPollCountRef.current += 1;
            if (
              generationPollCountRef.current ===
              MODULE_LESSON_GENERATION_MAX_POLLS + 1
            ) {
              setLongGenerationKey({ planId, moduleId });
            }

            const outcome = await pollStatus();
            if (cancelled) {
              return;
            }
            if (outcome === 'error') {
              refresh();
              schedule();
              return;
            }
            if (outcome === 'terminal') {
              setRequestedGenerationKey(null);
              refresh();
              return;
            }
            if (outcome !== 'continue') {
              return;
            }

            schedule();
          })();
        },
        Math.min(
          MODULE_LESSON_GENERATION_POLL_MS *
            2 **
              Math.max(
                0,
                generationPollCountRef.current -
                  MODULE_LESSON_GENERATION_MAX_POLLS,
              ),
          MODULE_LESSON_GENERATION_MAX_POLL_MS,
        ),
      );
    };

    schedule();

    return () => {
      cancelled = true;
      abortController.abort();
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    generationRequested,
    moduleId,
    planId,
    refresh,
    requestedWorkflowRunId,
    status,
  ]);

  const generateLessons = useCallback((): void => {
    setRequestedGenerationKey(null);
    setLongGenerationKey(null);
    hasObservedGeneratingRef.current = false;
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/v1/plans/${planId}/modules/${moduleId}/lesson-content/generate`,
          { method: 'POST' },
        );

        let raw: unknown;
        try {
          raw = await response.json();
        } catch (parseError) {
          clientLogger.error(
            'Module lesson generation response JSON parse failed',
            {
              parseError,
              moduleId,
              planId,
              ok: response.ok,
              status: response.status,
            },
          );
          toast.error('Lesson generation returned an invalid response.');
          setLocalFailureKey(generationKey);
          return;
        }

        const parsed = ModuleLessonGenerationApiResponseSchema.safeParse(raw);

        if (!parsed.success) {
          clientLogger.error(
            'Module lesson generation response validation failed',
            {
              issues: parsed.error.flatten(),
              moduleId,
              planId,
              ok: response.ok,
              status: response.status,
            },
          );
          toast.error(
            response.ok
              ? 'Lesson generation returned unexpected data.'
              : 'Lesson generation request failed.',
          );
          setLocalFailureKey(generationKey);
          return;
        }

        applyModuleLessonGenerationResponse(parsed.data, {
          markFailed: () => setLocalFailureKey(generationKey),
          markGenerating: (workflowRunId) =>
            setRequestedGenerationKey({ planId, moduleId, workflowRunId }),
          refresh,
        });
      } catch (error) {
        clientLogger.error('Module lesson generation request failed', {
          error,
          moduleId,
          planId,
        });
        toast.error('Unable to start lesson generation.');
        setLocalFailureKey(generationKey);
      }
    });
  }, [generationKey, moduleId, planId, refresh]);

  useEffect(() => {
    if (status !== 'not_generated') {
      return;
    }
    const key = `${planId}:${moduleId}`;
    if (autoStartedKeyRef.current === key) {
      return;
    }
    autoStartedKeyRef.current = key;
    generateLessons();
  }, [generateLessons, moduleId, planId, status]);

  return {
    generateLessons,
    generationTakingLong,
    isPending:
      isPending ||
      generationRequested ||
      (status === 'not_generated' && localFailureKey !== generationKey),
  };
}
