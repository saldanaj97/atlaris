'use client';

import { updateModuleTaskProgressAction } from '@/app/plans/[id]/modules/[moduleId]/actions';
import { Button } from '@/components/ui/button';
import type { ProgressStatus } from '@/lib/types/db';
import { CheckCircle2, Circle, Loader2Icon } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';

interface TaskStatusButtonProps {
  planId: string;
  moduleId: string;
  taskId: string;
  status: ProgressStatus;
  onStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
}

/**
 * A button component for updating the progress status of a task from the module detail page.
 * It toggles between 'not_started' and 'completed' statuses, with optimistic UI updates
 * and server-side persistence via a server action.
 */
export function TaskStatusButton({
  planId,
  moduleId,
  taskId,
  status,
  onStatusChange,
}: TaskStatusButtonProps) {
  const isCompleted = status === 'completed';
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    if (isPending) {
      return;
    }

    const previousStatus = status;
    const nextStatus: ProgressStatus = isCompleted
      ? 'not_started'
      : 'completed';

    // Optimistically update the UI
    onStatusChange(taskId, nextStatus);

    // Call the server action to update the status
    startTransition(() => {
      updateModuleTaskProgressAction({
        planId,
        moduleId,
        taskId,
        status: nextStatus,
      }).catch(() => {
        onStatusChange(taskId, previousStatus);
        toast.error('Failed to update task status. Please try again.');
      });
    });
  };

  return (
    <Button
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={isCompleted}
      aria-label={
        isCompleted ? 'Mark task as incomplete' : 'Mark task as complete'
      }
      className={`flex items-center rounded-xl px-4 py-2 text-sm font-medium transition-all ${
        isCompleted
          ? 'bg-green-500 text-white hover:bg-green-600'
          : 'hover:bg-primary bg-white/50 text-stone-700 hover:text-white dark:bg-stone-800/50 dark:text-stone-300'
      }`}
    >
      <div className="flex items-center gap-2">
        {isPending ? (
          <Loader2Icon className="h-5 w-5 animate-spin" />
        ) : isCompleted ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
        {isCompleted ? 'Completed' : 'Mark Complete'}
      </div>
    </Button>
  );
}
