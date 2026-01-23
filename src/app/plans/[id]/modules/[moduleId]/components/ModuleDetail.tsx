'use client';

import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Accordion } from '@/components/ui/accordion';
import type { ModuleDetail as ModuleDetailData } from '@/lib/db/queries/modules';
import type { ProgressStatus } from '@/lib/types/db';
import { LessonAccordionItem } from './LessonAccordionItem';
import { ModuleHeader } from './ModuleHeader';

interface ModuleDetailProps {
  moduleData: ModuleDetailData;
}

/**
 * Determines if a lesson is locked based on:
 * 1. Whether previous modules are complete
 * 2. Whether all previous lessons in this module are complete
 */
function isLessonLocked(
  lessonIndex: number,
  statuses: Record<string, ProgressStatus>,
  lessonIds: string[],
  previousModulesComplete: boolean
): boolean {
  // If previous modules aren't complete, all lessons in this module are locked
  if (!previousModulesComplete) {
    return true;
  }

  // First lesson is unlocked if previous modules are complete
  if (lessonIndex === 0) {
    return false;
  }

  // Check if all previous lessons are completed
  for (let i = 0; i < lessonIndex; i++) {
    const prevLessonId = lessonIds[i];
    if (statuses[prevLessonId] !== 'completed') {
      return true;
    }
  }

  return false;
}

/**
 * Main client component for the module detail page.
 * Manages local lesson status state and renders the module content with accordion-based lessons.
 */
export function ModuleDetail({ moduleData }: ModuleDetailProps) {
  const {
    module,
    planId,
    planTopic,
    totalModules,
    previousModuleId,
    nextModuleId,
    previousModulesComplete,
    allModules,
  } = moduleData;

  const lessons = useMemo(() => module.tasks ?? [], [module.tasks]);
  const lessonIds = useMemo(() => lessons.map((l) => l.id), [lessons]);

  // Initialize lesson statuses from server data
  const [statuses, setStatuses] = useState<Record<string, ProgressStatus>>(
    () => {
      const initial: Record<string, ProgressStatus> = {};
      for (const lesson of lessons) {
        initial[lesson.id] = lesson.progress?.status ?? 'not_started';
      }
      return initial;
    }
  );

  const handleStatusChange = (taskId: string, nextStatus: ProgressStatus) => {
    setStatuses((prev) => {
      if (prev[taskId] === nextStatus) return prev;
      return { ...prev, [taskId]: nextStatus };
    });
  };

  // Calculate completion status
  const { completedLessons, totalLessons, isModuleComplete } = useMemo(() => {
    const total = lessons.length;
    const completed = lessons.filter(
      (l) => statuses[l.id] === 'completed'
    ).length;
    return {
      completedLessons: completed,
      totalLessons: total,
      isModuleComplete: total > 0 && completed === total,
    };
  }, [lessons, statuses]);

  // Find the first unlocked incomplete lesson for default expansion
  const firstUnlockedIncompleteLessonId = useMemo(() => {
    for (let i = 0; i < lessons.length; i++) {
      const lesson = lessons[i];
      const isLocked = isLessonLocked(
        i,
        statuses,
        lessonIds,
        previousModulesComplete
      );
      if (!isLocked && statuses[lesson.id] !== 'completed') {
        return lesson.id;
      }
    }
    return undefined;
  }, [lessons, statuses, lessonIds, previousModulesComplete]);

  return (
    <div className="space-y-8">
      {/* Module Header with Glassmorphism */}
      <ModuleHeader
        module={module}
        planId={planId}
        planTopic={planTopic}
        totalModules={totalModules}
        previousModuleId={previousModuleId}
        nextModuleId={nextModuleId}
        statuses={statuses}
        previousModulesComplete={previousModulesComplete}
        allModules={allModules}
      />

      {/* Lessons Section with Accordion */}
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
              const isLocked = isLessonLocked(
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
                  moduleId={module.id}
                  status={statuses[lesson.id] ?? 'not_started'}
                  onStatusChange={handleStatusChange}
                  isLocked={isLocked}
                />
              );
            })}
          </Accordion>
        )}
      </section>

      {/* Module Completion / Navigation */}
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
    </div>
  );
}
