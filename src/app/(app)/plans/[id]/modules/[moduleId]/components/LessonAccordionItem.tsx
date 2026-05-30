'use client';

import type { ModuleDetailTask } from '@/features/plans/read-projection/types';
import type { ProgressStatus } from '@/shared/types/db.types';
import type { JSX } from 'react';

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
    <div className='relative min-h-75 overflow-hidden rounded-xl border border-border/50'>
      <div className='flex min-h-75 items-center justify-center bg-background/90 p-8 dark:bg-background/85'>
        <div className='max-w-sm rounded-lg border border-panel-border bg-panel p-8 text-center text-panel-foreground shadow-sm'>
          <div className='mb-4 flex justify-center'>
            <div className='flex size-16 items-center justify-center rounded-full bg-muted'>
              <Lock className='size-8 text-muted-foreground/50' />
            </div>
          </div>
          <h3 className='mb-2 text-lg font-semibold text-foreground'>
            Lesson Locked
          </h3>
          <p className='max-w-xs text-sm text-muted-foreground'>
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
}: LessonAccordionItemProps): JSX.Element {
  const isCompleted = status === 'completed';
  const resources = lesson.resources ?? [];

  return (
    <AccordionItem
      value={lesson.id}
      disabled={isLocked}
      className={cn(
        'rounded-2xl border transition-all duration-300',
        getLessonCardClassName(isLocked, isCompleted),
      )}
    >
      <AccordionTrigger
        hideChevron={false}
        className={cn(
          'items-center px-6 py-4 hover:no-underline [&[data-state=open]>svg]:rotate-180',
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

      <AccordionContent className='px-6 pb-6'>
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
