'use client';

import type { ModuleDetailTask } from '@/features/plans/read-projection/types';
import type { ProgressStatus } from '@/shared/types/db.types';

import { getLessonCardClassName } from './lessonAccordionStyles';
import { LessonAccordionTriggerContent } from './LessonAccordionTriggerContent';
import { LessonBodyPanel } from './LessonContentBlocks';
import { LessonResourceList } from './LessonResourceList';
import { TaskCompletionButton } from '@/app/(app)/plans/[id]/components/TaskCompletionButton';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { Lock } from 'lucide-react';

interface LessonAccordionItemProps {
  lesson: ModuleDetailTask;
  status: ProgressStatus;
  onStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
  isLocked?: boolean;
}

type LessonResources = NonNullable<ModuleDetailTask['resources']>;

function LockedContentOverlay() {
  return (
    <div className='relative min-h-64 w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-border/50'>
      <div className='flex min-h-64 min-w-0 items-center justify-center bg-background/90 p-4 sm:p-8 dark:bg-background/85'>
        <div className='w-full max-w-sm min-w-0 rounded-lg border border-panel-border bg-panel p-5 text-center text-panel-foreground shadow-sm sm:p-8'>
          <div className='mb-4 flex justify-center'>
            <div className='flex size-16 items-center justify-center rounded-full bg-muted'>
              <Lock className='size-8 text-muted-foreground/50' />
            </div>
          </div>
          <h3 className='mb-2 text-lg font-semibold text-foreground'>
            Lesson Locked
          </h3>
          <p className='mx-auto max-w-xs text-sm break-words text-muted-foreground'>
            Complete the previous lessons to unlock this content.
          </p>
        </div>
      </div>
    </div>
  );
}

function LessonContent({
  lesson,
  onStatusChange,
  resources,
  status,
}: {
  lesson: ModuleDetailTask;
  onStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
  resources: LessonResources;
  status: ProgressStatus;
}) {
  return (
    <>
      <LessonResourceList resources={resources} />
      <LessonBodyPanel lesson={lesson} />

      <div className='mt-6 flex justify-end'>
        <TaskCompletionButton
          taskId={lesson.id}
          status={status}
          onStatusChange={onStatusChange}
          variant='lesson'
        />
      </div>
    </>
  );
}

export function LessonAccordionItem({
  lesson,
  status,
  onStatusChange,
  isLocked = false,
}: LessonAccordionItemProps) {
  const isCompleted = status === 'completed';
  const resources = lesson.resources ?? [];

  return (
    <AccordionItem
      value={lesson.id}
      disabled={isLocked}
      id={`lesson-${lesson.id}`}
      data-progress-state={
        isLocked ? 'locked' : isCompleted ? 'completed' : 'active'
      }
      className={cn(
        'min-w-0 max-w-full overflow-hidden rounded-2xl border last:border-b transition-[border-color,background-color,box-shadow] duration-300',
        getLessonCardClassName(isLocked, isCompleted),
      )}
    >
      <AccordionTrigger
        hideChevron={false}
        className={cn(
          'min-w-0 items-start px-4 py-4 hover:no-underline [&[data-state=open]>svg]:rotate-180 sm:px-6',
          isLocked && 'cursor-not-allowed',
        )}
      >
        <LessonAccordionTriggerContent
          lesson={lesson}
          isCompleted={isCompleted}
          isLocked={isLocked}
          resourceCount={resources.length}
        />
      </AccordionTrigger>

      <AccordionContent className='min-w-0 px-4 pb-4 sm:px-6 sm:pb-6'>
        <div className='border-t border-border/50 pt-6'>
          {isLocked ? (
            <LockedContentOverlay />
          ) : (
            <LessonContent
              lesson={lesson}
              status={status}
              onStatusChange={onStatusChange}
              resources={resources}
            />
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
