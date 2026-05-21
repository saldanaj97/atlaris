'use client';

import type { JSX } from 'react';
import { useMemo } from 'react';
import { GenerationStatePanel } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/GenerationStatePanel';
import { LessonAccordionItem } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/LessonAccordionItem';
import { ModuleCompletePanel } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleCompletePanel';
import { useModuleLessonGeneration } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/useModuleLessonGeneration';
import { Accordion } from '@/components/ui/accordion';
import { Surface } from '@/components/ui/surface';
import { deriveLessonState } from '@/features/plans/task-progress/client';
import type {
  ModuleDetailModule,
  ModuleDetailTask,
} from '@/features/plans/read-projection/types';
import type { ProgressStatus } from '@/shared/types/db.types';

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
  const { generateLessons, generationTakingLong, isPending, quotaMessage } =
    useModuleLessonGeneration({
      planId,
      moduleId,
      status: lessonGeneration.status,
      previousModulesComplete,
    });

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

  return (
    <>
      <section>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-foreground">Lessons</h2>
          <span className="text-sm text-muted-foreground">
            {completedLessons}/{totalLessons} completed
          </span>
        </div>

        <GenerationStatePanel
          lessonGeneration={lessonGeneration}
          previousModulesComplete={previousModulesComplete}
          quotaMessage={quotaMessage}
          generationTakingLong={generationTakingLong}
          onGenerate={generateLessons}
          isPending={isPending}
        />

        {lessons.length === 0 ? (
          <Surface variant="default" padding="none" className="p-8 text-center">
            <p className="text-muted-foreground">
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
        <ModuleCompletePanel planId={planId} nextModuleId={nextModuleId} />
      )}
    </>
  );
}
