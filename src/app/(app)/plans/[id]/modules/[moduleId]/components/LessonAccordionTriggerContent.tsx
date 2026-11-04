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
        <span className='type-label font-semibold' aria-hidden='true'>
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
        'mb-3 ml-11 flex min-w-0 flex-wrap items-center gap-4 type-body',
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
    // Title, then a meta row (Locked, time) under it, so on phones the badge and
    // time never squeeze the title or push the marker onto its own line.
    <div className='min-w-0 flex-1 text-left'>
      <div className='mb-2 flex min-w-0 items-start gap-3'>
        <LessonMarker
          lesson={lesson}
          isCompleted={isCompleted}
          isLocked={isLocked}
        />
        <div className='min-w-0 flex-1'>
          <h3
            className={cn(
              'min-w-0 break-words type-reading font-semibold',
              getLessonTitleClassName(isLocked, isCompleted),
            )}
          >
            {lesson.title}
          </h3>
          <div
            className={cn(
              'mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 type-body',
              getLessonMutedTextClassName(isLocked),
            )}
          >
            {isLocked ? <Badge variant='secondary'>Locked</Badge> : null}
            <span className='inline-flex items-center gap-1.5'>
              <Clock className='size-4' aria-hidden />
              {formatMinutes(lesson.estimatedMinutes)}
            </span>
          </div>
        </div>
      </div>

      {lesson.description ? (
        <p
          className={cn(
            'mb-3 ml-11 min-w-0 break-words type-body',
            getLessonMutedTextClassName(isLocked),
          )}
        >
          {lesson.description}
        </p>
      ) : null}

      <ResourceSummary isLocked={isLocked} resourceCount={resourceCount} />
    </div>
  );
}
