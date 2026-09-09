'use client';

import type {
  ModuleDetailModule,
  ModuleDetailTask,
} from '@/features/plans/read-projection/types';
import type { ProgressStatus } from '@/shared/types/db.types';

import { GenerationStatePanel } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/GenerationStatePanel';
import { LessonAccordionItem } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/LessonAccordionItem';
import { getLessonMarkerClassName } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/lessonAccordionStyles';
import { ModuleCompletePanel } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/ModuleCompletePanel';
import { useModuleLessonGeneration } from '@/app/(app)/plans/[id]/modules/[moduleId]/components/useModuleLessonGeneration';
import { Accordion } from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';
import { Surface } from '@/components/ui/surface';
import { formatMinutes } from '@/features/plans/formatters';
import { deriveLessonState } from '@/features/plans/task-progress/client';
import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, Lock } from 'lucide-react';

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

interface LessonProgressPanelProps {
  lessons: ModuleDetailTask[];
  statuses: Record<string, ProgressStatus>;
  lessonLocks: boolean[];
  firstUnlockedIncompleteLessonId: string | undefined;
}

function LessonProgressPanel({
  lessons,
  statuses,
  lessonLocks,
  firstUnlockedIncompleteLessonId,
}: LessonProgressPanelProps) {
  const totalLessons = lessons.length;
  const completedLessons = lessons.filter(
    (lesson) => (statuses[lesson.id] ?? lesson.status) === 'completed',
  ).length;
  const completionPercent =
    totalLessons > 0
      ? Math.round((completedLessons / totalLessons) * 100)
      : null;

  return (
    <aside
      aria-labelledby='lesson-progress-heading'
      className='min-w-0 xl:sticky xl:top-24'
    >
      <div className='overflow-hidden rounded-[12px] border border-panel-border bg-panel-muted shadow-sm'>
        <div className='min-w-0 px-4 py-4 sm:px-5'>
          <h2
            id='lesson-progress-heading'
            className='text-xl leading-7 font-semibold text-foreground'
          >
            Lesson progress
          </h2>
          <p className='mt-2 text-sm leading-[22px] text-muted-foreground tabular-nums'>
            {totalLessons > 0
              ? `${completedLessons} of ${totalLessons} lesson${totalLessons === 1 ? '' : 's'}${
                  completionPercent !== null ? ` · ${completionPercent}%` : ''
                }`
              : 'No lessons available yet'}
          </p>
        </div>

        {totalLessons === 0 ? (
          <p className='px-4 py-5 text-sm text-muted-foreground sm:px-5'>
            Lesson progress will appear when this module has lessons.
          </p>
        ) : (
          <div className='min-w-0 px-4 py-4 sm:px-5 sm:py-5'>
            <div className='flex min-w-0 items-center gap-3'>
              <Progress
                value={completionPercent ?? 0}
                aria-label={`Lesson progress: ${completionPercent}%`}
                className='h-2'
              />
              <span className='shrink-0 text-xs text-muted-foreground tabular-nums'>
                {completionPercent}%
              </span>
            </div>

            <nav aria-label='Lesson navigation' className='mt-5 min-w-0'>
              <ol className='space-y-1'>
                {lessons.map((lesson, index) => {
                  const isLocked = lessonLocks[index] ?? true;
                  const status = statuses[lesson.id] ?? lesson.status;
                  const isCompleted = status === 'completed';
                  const isCurrent =
                    lesson.id === firstUnlockedIncompleteLessonId;
                  const rowClassName = cn(
                    'flex min-h-11 min-w-0 max-w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors motion-reduce:transition-none',
                    isCurrent
                      ? 'border-primary/20 bg-primary/10 text-foreground'
                      : 'border-transparent text-muted-foreground',
                    isLocked
                      ? 'cursor-not-allowed opacity-80'
                      : 'hover:border-border hover:bg-panel hover:text-foreground',
                  );
                  const markerClassName = cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border',
                    getLessonMarkerClassName(isLocked, isCompleted),
                  );
                  const label = (
                    <>
                      <span aria-hidden='true' className={markerClassName}>
                        {isLocked ? (
                          <Lock className='size-3.5' />
                        ) : isCompleted ? (
                          <CheckCircle2 className='size-4' />
                        ) : (
                          <Circle className='size-3.5' />
                        )}
                      </span>
                      <span className='min-w-0 flex-1 break-words'>
                        {lesson.order}. {lesson.title}
                        <span className='sr-only'>
                          {isLocked
                            ? ', locked'
                            : isCompleted
                              ? ', completed'
                              : isCurrent
                                ? ', current'
                                : ', available'}
                        </span>
                      </span>
                      <span className='shrink-0 text-xs tabular-nums'>
                        {formatMinutes(lesson.estimatedMinutes)}
                      </span>
                    </>
                  );

                  return (
                    <li key={lesson.id}>
                      {isLocked ? (
                        <span className={rowClassName}>{label}</span>
                      ) : (
                        <a
                          href={`#lesson-${lesson.id}`}
                          aria-current={isCurrent ? 'step' : undefined}
                          className={rowClassName}
                        >
                          {label}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          </div>
        )}
      </div>
    </aside>
  );
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
  const { generateLessons, generationTakingLong, isPending } =
    useModuleLessonGeneration({
      planId,
      moduleId,
      status: lessonGeneration.status,
    });

  const totalLessons = lessons.length;
  const completedLessons = lessons.filter(
    (lesson) => (statuses[lesson.id] ?? lesson.status) === 'completed',
  ).length;
  const isModuleComplete =
    totalLessons > 0 && completedLessons === totalLessons;

  const { locks: lessonLocks, firstUnlockedIncompleteLessonId } =
    deriveLessonState(lessons, statuses, previousModulesComplete);

  return (
    <>
      <div className='grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]'>
        <section aria-labelledby='lessons-heading' className='min-w-0'>
          <div className='mb-6 flex min-w-0 items-baseline justify-between gap-4 border-b border-border pb-2'>
            <h2
              id='lessons-heading'
              className='text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase'
            >
              Lessons
            </h2>
            <span className='shrink-0 text-xs text-muted-foreground tabular-nums'>
              {totalLessons > 0
                ? `${completedLessons}/${totalLessons} completed`
                : 'No lessons yet'}
            </span>
          </div>

          <GenerationStatePanel
            lessonGeneration={lessonGeneration}
            generationTakingLong={generationTakingLong}
            onRetry={generateLessons}
            isPending={isPending}
          />

          {lessons.length === 0 ? (
            <Surface
              variant='default'
              padding='none'
              className='p-8 text-center'
            >
              <p className='text-muted-foreground'>
                No lessons are available for this module yet.
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

        <LessonProgressPanel
          lessons={lessons}
          statuses={statuses}
          lessonLocks={lessonLocks}
          firstUnlockedIncompleteLessonId={firstUnlockedIncompleteLessonId}
        />
      </div>

      {isModuleComplete && (
        <ModuleCompletePanel planId={planId} nextModuleId={nextModuleId} />
      )}
    </>
  );
}
