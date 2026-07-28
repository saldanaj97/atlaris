'use client';

import type {
  ModuleDetailModule,
  ModuleDetailTask,
} from '@/features/plans/read-projection/types';
import type { ProgressStatus } from '@/shared/types/db.types';

import { GenerationStatePanel } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/GenerationStatePanel';
import { LessonAccordionItem } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/LessonAccordionItem';
import { ModuleCompletePanel } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleCompletePanel';
import { useModuleLessonGeneration } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/useModuleLessonGeneration';
import { Accordion } from '@/components/ui/accordion';
import { Surface } from '@/components/ui/surface';
import { deriveLessonState } from '@/features/plans/task-progress/client';

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
}: ModuleLessonsClientProps) {
  const { generateLessons, generationTakingLong, isPending, quotaMessage } =
    useModuleLessonGeneration({
      planId,
      moduleId,
      status: lessonGeneration.status,
      previousModulesComplete,
    });

  const totalLessons = lessons.length;
  let completedLessons = 0;
  for (const lesson of lessons) {
    if ((statuses[lesson.id] ?? lesson.status) === 'completed') {
      completedLessons++;
    }
  }
  const isModuleComplete =
    totalLessons > 0 && completedLessons === totalLessons;

  const { locks: lessonLocks, firstUnlockedIncompleteLessonId } =
    deriveLessonState(lessons, statuses, previousModulesComplete);

  return (
    <>
      <section>
        <div className='mb-6 flex items-baseline justify-between border-b border-border pb-2'>
          <h2 className='text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase'>
            Lessons
          </h2>
          <span className='text-xs text-muted-foreground tabular-nums'>
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
          <Surface variant='default' padding='none' className='p-8 text-center'>
            <p className='text-muted-foreground'>
              No lessons available for this module.
            </p>
          </Surface>
        ) : (
          <Accordion
            type='single'
            collapsible
            defaultValue={firstUnlockedIncompleteLessonId}
            className='space-y-4'
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
