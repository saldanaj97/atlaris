import type { ModuleDetailTask } from '@/features/plans/read-projection/types';

import {
  getLessonMarkerClassName,
  getLessonMutedTextClassName,
  getLessonTitleClassName,
} from './lessonAccordionStyles';
import { Badge } from '@/components/ui/badge';
import { formatMinutes } from '@/features/plans/formatters';
import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, Link as LinkIcon, Lock } from 'lucide-react';

function LessonMarker({
  lesson,
  isCompleted,
  isLocked,
}: {
  lesson: ModuleDetailTask;
  isCompleted: boolean;
  isLocked: boolean;
}) {
  const progressState = isLocked
    ? 'locked'
    : isCompleted
      ? 'completed'
      : 'active';
  const statusLabel = isLocked
    ? `Lesson ${lesson.order}, locked`
    : isCompleted
      ? `Lesson ${lesson.order}, completed`
      : `Lesson ${lesson.order}, available`;

  return (
    <div
      data-state={progressState}
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,box-shadow] duration-300 ease-out motion-reduce:transition-none',
        getLessonMarkerClassName(isLocked, isCompleted),
      )}
    >
      <span className='sr-only'>{statusLabel}</span>
      {isLocked ? (
        <Lock className='size-4' aria-hidden />
      ) : isCompleted ? (
        <CheckCircle2 className='size-5' aria-hidden />
      ) : (
        <span className='text-sm font-semibold' aria-hidden='true'>
          {lesson.order}
        </span>
      )}
    </div>
  );
}

function ResourceSummary({
  isLocked,
  resourceCount,
}: {
  isLocked: boolean;
  resourceCount: number;
}) {
  if (resourceCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'mb-3 ml-11 flex flex-wrap items-center gap-4 text-sm',
        getLessonMutedTextClassName(isLocked),
      )}
    >
      <span className='inline-flex items-center gap-1.5'>
        <LinkIcon className='size-4' />
        {resourceCount} resource{resourceCount !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

export function LessonAccordionTriggerContent({
  lesson,
  isCompleted,
  isLocked,
  resourceCount,
}: {
  lesson: ModuleDetailTask;
  isCompleted: boolean;
  isLocked: boolean;
  resourceCount: number;
}) {
  return (
    <>
      <div className='flex-1 text-left'>
        <div className='mb-2 flex items-center gap-3'>
          <LessonMarker
            lesson={lesson}
            isCompleted={isCompleted}
            isLocked={isLocked}
          />
          <h3
            className={cn(
              'text-lg font-semibold',
              getLessonTitleClassName(isLocked, isCompleted),
            )}
          >
            {lesson.title}
          </h3>
          {isLocked ? (
            <Badge variant='secondary' className='border-transparent'>
              Locked
            </Badge>
          ) : null}
        </div>

        {lesson.description ? (
          <p
            className={cn(
              'mb-3 ml-11 text-sm leading-relaxed',
              getLessonMutedTextClassName(isLocked),
            )}
          >
            {lesson.description}
          </p>
        ) : null}

        <ResourceSummary isLocked={isLocked} resourceCount={resourceCount} />
      </div>

      <span
        className={cn(
          'flex shrink-0 items-center text-sm',
          getLessonMutedTextClassName(isLocked),
        )}
      >
        <span className='inline-flex items-center gap-1.5'>
          <Clock className='size-4' />
          {formatMinutes(lesson.estimatedMinutes)}
        </span>
      </span>
    </>
  );
}
