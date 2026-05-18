'use client';

import { ArrowRight, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { LessonAccordionItem } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/LessonAccordionItem';
import { Accordion } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { deriveLessonState } from '@/features/plans/task-progress/client';
import type {
  ModuleDetailModule,
  ModuleDetailTask,
  ModuleLessonGenerationSummary,
} from '@/features/plans/read-projection/types';
import { clientLogger } from '@/lib/logging/client';
import { ModuleLessonGenerationApiResponseSchema } from '@/shared/schemas/lesson-content.schemas';
import type { ModuleLessonGenerationApiResponse } from '@/shared/types/lesson-content.types';
import type { ProgressStatus } from '@/shared/types/db.types';

const MODULE_LESSON_GENERATION_POLL_MS = 2500;
const MODULE_LESSON_GENERATION_MAX_POLLS = 20;

interface ModuleLessonsClientProps {
  planId: string;
  moduleId: string;
  lessons: ModuleDetailTask[];
  lessonGeneration: ModuleDetailModule['lessonGeneration'];
  nextModuleId: string | null;
  previousModulesComplete: boolean;
  statuses: Record<string, ProgressStatus>;
  onStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
}

function getGenerationStatusLabel(
  lessonGeneration: ModuleLessonGenerationSummary,
): string {
  switch (lessonGeneration.status) {
    case 'not_generated':
      return 'Not generated';
    case 'generating':
      return 'Generating';
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Failed';
    default: {
      const _exhaustive: never = lessonGeneration.status;
      return _exhaustive;
    }
  }
}

function GenerationStatePanel({
  lessonGeneration,
  previousModulesComplete,
  quotaMessage,
  generationTakingLong,
  onGenerate,
  isPending,
}: {
  lessonGeneration: ModuleLessonGenerationSummary;
  previousModulesComplete: boolean;
  quotaMessage: string | null;
  generationTakingLong: boolean;
  onGenerate: () => void;
  isPending: boolean;
}): JSX.Element | null {
  if (!previousModulesComplete) {
    return (
      <Surface variant="default" padding="none" className="mb-6 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-muted p-2 text-muted-foreground">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h3 className="font-semibold text-stone-900 dark:text-stone-100">
              Lesson generation unlocks with this module
            </h3>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Complete previous modules first. Locked modules never start
              provider generation.
            </p>
          </div>
        </div>
      </Surface>
    );
  }

  if (lessonGeneration.status === 'ready') {
    return null;
  }

  const canGenerate =
    lessonGeneration.status === 'not_generated' ||
    lessonGeneration.status === 'failed';

  return (
    <Surface variant="default" padding="none" className="mb-6 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="font-semibold text-stone-900 dark:text-stone-100">
              Detailed lesson content
            </h3>
            <Badge variant="secondary">
              {getGenerationStatusLabel(lessonGeneration)}
            </Badge>
          </div>
          {lessonGeneration.status === 'generating' ? (
            <>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Generation is running for the full module. You can keep
                reviewing lessons, resources, and progress while content is
                prepared.
              </p>
              {generationTakingLong ? (
                <p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-400">
                  Generation taking longer than expected
                </p>
              ) : null}
            </>
          ) : lessonGeneration.status === 'failed' ? (
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {lessonGeneration.error ??
                'Generation failed. Retry to create fresh lesson content for this module.'}
            </p>
          ) : (
            <p className="text-sm text-stone-500 dark:text-stone-400">
              One click generates and caches detailed content for every lesson
              in this module.
            </p>
          )}
          {quotaMessage ? (
            <p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-400">
              {quotaMessage}
            </p>
          ) : null}
        </div>

        {lessonGeneration.status === 'generating' ? (
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <span className="animate-spin">
              <Loader2 className="size-4" />
            </span>
            Generating
          </div>
        ) : canGenerate ? (
          <Button onClick={onGenerate} disabled={isPending}>
            {isPending ? 'Generating...' : 'Generate lessons'}
          </Button>
        ) : null}
      </div>
    </Surface>
  );
}

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
      refresh();
      return;
    case 'generating':
      refresh();
      return;
    default: {
      const _exhaustive: never = body;
      return _exhaustive;
    }
  }
}

export function ModuleLessonsClient({
  planId,
  moduleId,
  lessons,
  lessonGeneration,
  nextModuleId,
  previousModulesComplete,
  statuses,
  onStatusChange,
}: ModuleLessonsClientProps): JSX.Element {
  const { refresh } = useRouter();
  const [isPending, startTransition] = useTransition();
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null);
  const [generationTakingLong, setGenerationTakingLong] = useState(false);
  const generationPollCountRef = useRef(0);

  const { completedLessons, totalLessons, isModuleComplete } = useMemo(() => {
    const total = lessons.length;
    const completed = lessons.filter(
      (lesson) => (statuses[lesson.id] ?? lesson.status) === 'completed',
    ).length;

    return {
      completedLessons: completed,
      totalLessons: total,
      isModuleComplete: total > 0 && completed === total,
    };
  }, [lessons, statuses]);

  const { locks: lessonLocks, firstUnlockedIncompleteLessonId } = useMemo(
    () => deriveLessonState(lessons, statuses, previousModulesComplete),
    [lessons, previousModulesComplete, statuses],
  );

  useEffect(() => {
    if (lessonGeneration.status !== 'generating' || !previousModulesComplete) {
      generationPollCountRef.current = 0;
      setGenerationTakingLong(false);
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;

    const schedule = (): void => {
      timeoutId = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        generationPollCountRef.current += 1;
        if (
          generationPollCountRef.current > MODULE_LESSON_GENERATION_MAX_POLLS
        ) {
          setGenerationTakingLong(true);
          return;
        }
        refresh();
        if (!cancelled) {
          schedule();
        }
      }, MODULE_LESSON_GENERATION_POLL_MS);
    };

    schedule();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [lessonGeneration.status, previousModulesComplete, refresh]);

  const handleGenerateLessons = (): void => {
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
          if (!response.ok) {
            toast.error('Lesson generation request failed.');
          } else {
            toast.error('Lesson generation returned unexpected data.');
          }
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

  return (
    <>
      <section>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
            Lessons
          </h2>
          <span className="text-sm text-stone-500 dark:text-stone-400">
            {completedLessons}/{totalLessons} completed
          </span>
        </div>

        <GenerationStatePanel
          lessonGeneration={lessonGeneration}
          previousModulesComplete={previousModulesComplete}
          quotaMessage={quotaMessage}
          generationTakingLong={generationTakingLong}
          onGenerate={handleGenerateLessons}
          isPending={isPending}
        />

        {lessons.length === 0 ? (
          <Surface variant="default" padding="none" className="p-8 text-center">
            <p className="text-stone-500 dark:text-stone-400">
              No lessons available for this module.
            </p>
          </Surface>
        ) : (
          <Accordion
            type="single"
            collapsible
            defaultValue={firstUnlockedIncompleteLessonId}
            className="space-y-4"
          >
            {lessons.map((lesson, index) => {
              const locked = lessonLocks[index] ?? true;

              return (
                <LessonAccordionItem
                  key={lesson.id}
                  lesson={lesson}
                  status={statuses[lesson.id] ?? lesson.status}
                  onStatusChange={onStatusChange}
                  isLocked={locked}
                />
              );
            })}
          </Accordion>
        )}
      </section>

      {isModuleComplete && (
        <section className="rounded-2xl border border-success/30 bg-success/5 p-6 text-center shadow-sm dark:border-success/30 dark:bg-success/10">
          <CheckCircle2 className="mx-auto mb-3 size-12 text-success" />
          <h3 className="mb-2 text-xl font-semibold text-success">
            Module Completed!
          </h3>
          <p className="mb-4 text-success/90">
            Great work! You&apos;ve completed all lessons in this module.
          </p>
          {nextModuleId ? (
            <Button asChild variant="success" className="h-auto px-6 py-3">
              <Link href={`/plans/${planId}/modules/${nextModuleId}`}>
                Continue to Next Module
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <Button asChild className="h-auto px-6 py-3">
              <Link href={`/plans/${planId}`}>
                Back to Plan Overview
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          )}
        </section>
      )}
    </>
  );
}
