'use client';

import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';
import { useMemo } from 'react';
import { LessonAccordionItem } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/LessonAccordionItem';
import { Accordion } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { deriveLessonState } from '@/features/plans/task-progress/client';
import type { TaskWithRelations } from '@/lib/db/queries/types/modules.types';
import type { ProgressStatus } from '@/shared/types/db.types';

interface ModuleLessonsClientProps {
  planId: string;
  lessons: TaskWithRelations[];
  nextModuleId: string | null;
  previousModulesComplete: boolean;
  statuses: Record<string, ProgressStatus>;
  onStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
}

export function ModuleLessonsClient({
  planId,
  lessons,
  nextModuleId,
  previousModulesComplete,
  statuses,
  onStatusChange,
}: ModuleLessonsClientProps): JSX.Element {
  const { completedLessons, totalLessons, isModuleComplete } = useMemo(() => {
    const total = lessons.length;
    const completed = lessons.filter(
      (lesson) =>
        (statuses[lesson.id] ?? lesson.progress?.status) === 'completed',
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

  return (
    <>
      <section>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-stone-900 dark:text-stone-100">
            Lessons
          </h2>
          <span className="text-sm text-stone-500 dark:text-stone-400">
            {completedLessons}/{totalLessons} completed
          </span>
        </div>

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
                  status={
                    statuses[lesson.id] ??
                    lesson.progress?.status ??
                    'not_started'
                  }
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
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-success" />
          <h3 className="mb-2 text-xl font-bold text-success">
            Module Completed!
          </h3>
          <p className="mb-4 text-success/90">
            Great work! You&apos;ve completed all lessons in this module.
          </p>
          {nextModuleId ? (
            <Button asChild variant="success" className="h-auto px-6 py-3">
              <Link href={`/plans/${planId}/modules/${nextModuleId}`}>
                Continue to Next Module
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button asChild className="h-auto px-6 py-3">
              <Link href={`/plans/${planId}`}>
                Back to Plan Overview
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </section>
      )}
    </>
  );
}
