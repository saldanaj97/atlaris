import { CheckCircle2, Clock, Link as LinkIcon, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatMinutes } from '@/features/plans/formatters';
import type { ModuleDetailTask } from '@/features/plans/read-projection/types';
import { cn } from '@/lib/utils';
import {
  getLessonMarkerClassName,
  getLessonMutedTextClassName,
  getLessonTitleClassName,
} from './lessonAccordionStyles';

function LessonMarker({
  lesson,
  isCompleted,
  isLocked,
}: {
  lesson: ModuleDetailTask;
  isCompleted: boolean;
  isLocked: boolean;
}) {
  return (
    <div
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full',
        getLessonMarkerClassName(isLocked, isCompleted),
      )}
    >
      {isLocked ? (
        <Lock className="size-4" />
      ) : isCompleted ? (
        <CheckCircle2 className="size-5" />
      ) : (
        <span className="text-sm font-semibold">{lesson.order}</span>
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
      <span className="inline-flex items-center gap-1.5">
        <LinkIcon className="size-4" />
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
      <div className="flex-1 text-left">
        <div className="mb-2 flex items-center gap-3">
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
            <Badge variant="secondary" className="border-transparent">
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
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-4" />
          {formatMinutes(lesson.estimatedMinutes)}
        </span>
      </span>
    </>
  );
}
