import type { ModuleLessonGenerationApiResponse } from '@/shared/types/lesson-content.types';

import { clientLogger } from '@/lib/logging/client';
import {
  ModuleLessonGenerationApiResponseSchema,
  ModuleLessonGenerationStatusResponseSchema,
} from '@/shared/schemas/lesson-content.schemas';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

const MODULE_LESSON_GENERATION_POLL_MS = 2500;
const MODULE_LESSON_GENERATION_MAX_POLLS = 20;

function applyModuleLessonGenerationResponse(
  body: ModuleLessonGenerationApiResponse,
  params: {
    setQuotaMessage: (value: string | null) => void;
    refresh: () => void;
  },
): void {
  const { setQuotaMessage, refresh } = params;

  switch (body.state) {
    case 'quota_denied':
      setQuotaMessage(
        `Lesson generation quota reached (${body.currentCount}/${body.limit}).`,
      );
      return;
    case 'provider_failure':
      toast.error('Lesson generation failed. Please try again.');
      refresh();
      return;
    case 'locked':
      toast.error('Complete previous modules before generating lessons.');
      refresh();
      return;
    case 'disabled':
      toast.error('Lesson generation is temporarily unavailable.');
      refresh();
      return;
    case 'not_found':
      toast.error('Plan or module was not found.');
      refresh();
      return;
    case 'ready':
    case 'generating':
      refresh();
      return;
    default: {
      const _exhaustive: never = body;
      return _exhaustive;
    }
  }
}

function buildModuleLessonStatusUrl(planId: string, moduleId: string): string {
  return `/api/v1/plans/${planId}/modules/${moduleId}/lesson-content/status`;
}

export function useModuleLessonGeneration({
  planId,
  moduleId,
  status,
  previousModulesComplete,
}: {
  planId: string;
  moduleId: string;
  status: 'not_generated' | 'generating' | 'ready' | 'failed';
  previousModulesComplete: boolean;
}) {
  const { refresh } = useRouter();
  const [isPending, startTransition] = useTransition();
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null);
  const [generationTakingLong, setGenerationTakingLong] = useState(false);
  const generationPollCountRef = useRef(0);

  useEffect(() => {
    if (status !== 'generating') {
      generationPollCountRef.current = 0;
      setGenerationTakingLong(false);
      return;
    }

    if (!previousModulesComplete) {
      generationPollCountRef.current = 0;
      setGenerationTakingLong(false);
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;
    const statusUrl = buildModuleLessonStatusUrl(planId, moduleId);

    const pollStatus = async (): Promise<'continue' | 'terminal' | 'error'> => {
      try {
        const response = await fetch(statusUrl, { cache: 'no-store' });

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
          return 'continue';
        }

        refresh();
        return 'terminal';
      } catch (error) {
        clientLogger.error('Module lesson generation status request failed', {
          error,
          moduleId,
          planId,
        });
        return 'error';
      }
    };

    const schedule = (): void => {
      timeoutId = window.setTimeout(() => {
        void (async () => {
          if (cancelled) return;

          generationPollCountRef.current += 1;
          if (
            generationPollCountRef.current > MODULE_LESSON_GENERATION_MAX_POLLS
          ) {
            setGenerationTakingLong(true);
            return;
          }

          const outcome = await pollStatus();
          if (cancelled || outcome === 'terminal') {
            return;
          }

          schedule();
        })();
      }, MODULE_LESSON_GENERATION_POLL_MS);
    };

    schedule();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [moduleId, planId, previousModulesComplete, refresh, status]);

  const generateLessons = (): void => {
    if (!previousModulesComplete) {
      return;
    }

    setQuotaMessage(null);
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
          return;
        }

        applyModuleLessonGenerationResponse(parsed.data, {
          setQuotaMessage,
          refresh,
        });
      } catch (error) {
        clientLogger.error('Module lesson generation request failed', {
          error,
          moduleId,
          planId,
        });
        toast.error('Unable to start lesson generation.');
      }
    });
  };

  return {
    generateLessons,
    generationTakingLong,
    isPending,
    quotaMessage,
  };
}
