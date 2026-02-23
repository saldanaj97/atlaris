'use client';

import { Accordion } from '@/components/ui/accordion';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import type { TaskWithRelations } from '@/lib/db/queries/types/modules.types';
import type { ProgressStatus } from '@/lib/types/db';
import { LessonAccordionItem } from './LessonAccordionItem';

interface ModuleLessonsClientProps {
  planId: string;
  moduleId: string;
  lessons: TaskWithRelations[];
  nextModuleId: string | null;
  previousModulesComplete: boolean;
  initialStatuses: Record<string, ProgressStatus>;
}

function isLessonLocked(
  lessonIndex: number,
  statuses: Record<string, ProgressStatus>,
  lessonIds: string[],
  previousModulesComplete: boolean
): boolean {
  if (!previousModulesComplete) {
    return true;
  }

  if (lessonIndex === 0) {
    return false;
  }

  for (let index = 0; index < lessonIndex; index++) {
    const previousLessonId = lessonIds[index];
    if (statuses[previousLessonId] !== 'completed') {
      return true;
    }
  }

  return false;
}

export function ModuleLessonsClient({
  planId,
  moduleId,
  lessons,
  nextModuleId,
  previousModulesComplete,
  initialStatuses,
}: ModuleLessonsClientProps) {
  const [statuses, setStatuses] =
    useState<Record<string, ProgressStatus>>(initialStatuses);

  const lessonIds = useMemo(
    () => lessons.map((lesson) => lesson.id),
    [lessons]
  );

  const { completedLessons, totalLessons, isModuleComplete } = useMemo(() => {
    const total = lessons.length;
    const completed = lessons.filter(
      (lesson) => statuses[lesson.id] === 'completed'
    ).length;

    return {
      completedLessons: completed,
      totalLessons: total,
      isModuleComplete: total > 0 && completed === total,
    };
  }, [lessons, statuses]);

  const firstUnlockedIncompleteLessonId = useMemo(() => {
    for (let index = 0; index < lessons.length; index++) {
      const lesson = lessons[index];
      const locked = isLessonLocked(
        index,
        statuses,
        lessonIds,
        previousModulesComplete
      );

      if (!locked && statuses[lesson.id] !== 'completed') {
        return lesson.id;
      }
    }

    return undefined;
  }, [lessonIds, lessons, previousModulesComplete, statuses]);

  const handleStatusChange = (taskId: string, nextStatus: ProgressStatus) => {
    setStatuses((previousStatuses) => {
      if (previousStatuses[taskId] === nextStatus) {
        return previousStatuses;
      }

      return {
        ...previousStatuses,
        [taskId]: nextStatus,
      };
    });
  };

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
          <div className="rounded-2xl border border-white/40 bg-white/30 p-8 text-center shadow-lg backdrop-blur-xl dark:border-stone-800/50 dark:bg-stone-900/30">
            <p className="text-stone-500 dark:text-stone-400">
              No lessons available for this module.
            </p>
          </div>
        ) : (
          <Accordion
            type="single"
            collapsible
            defaultValue={firstUnlockedIncompleteLessonId}
            className="space-y-4"
          >
            {lessons.map((lesson, index) => {
              const locked = isLessonLocked(
                index,
                statuses,
                lessonIds,
                previousModulesComplete
              );

              return (
                <LessonAccordionItem
                  key={lesson.id}
                  lesson={lesson}
                  planId={planId}
                  moduleId={moduleId}
                  status={statuses[lesson.id] ?? 'not_started'}
                  onStatusChange={handleStatusChange}
                  isLocked={locked}
                />
              );
            })}
          </Accordion>
        )}
      </section>

      {isModuleComplete && (
        <section className="rounded-2xl border border-green-200/50 bg-green-50/50 p-6 text-center shadow-lg backdrop-blur-sm dark:border-green-800/30 dark:bg-green-950/30">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-500" />
          <h3 className="mb-2 text-xl font-bold text-green-700 dark:text-green-400">
            Module Completed!
          </h3>
          <p className="mb-4 text-green-600 dark:text-green-400">
            Great work! You&apos;ve completed all lessons in this module.
          </p>
          {nextModuleId ? (
            <Link
              href={`/plans/${planId}/modules/${nextModuleId}`}
              className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 font-medium text-white transition hover:bg-green-700"
            >
              Continue to Next Module
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <Link
              href={`/plans/${planId}`}
              className="bg-primary hover:bg-primary/90 inline-flex items-center gap-2 rounded-xl px-6 py-3 font-medium text-white transition"
            >
              Back to Plan Overview
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </section>
      )}
    </>
  );
}
