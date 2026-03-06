'use client';

import { updateTaskProgressAction } from '@/app/plans/[id]/actions';
import { Button } from '@/components/ui/button';
import type { ProgressStatus } from '@/lib/types/db';
import { CheckCircle2, CircleX, Loader2Icon } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';

interface UpdateTaskStatusButtonProps {
  planId: string;
  taskId: string;
  status: ProgressStatus;
  onStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
}

/**
 * A button component for updating the progress status of a task in a learning plan.
 * It toggles between 'not_started' and 'completed' statuses, using the React 19
 * `useOptimistic` pattern (update inside `startTransition`) for automatic rollback
 * and server-side persistence via a server action. Displays a loading state during
 * updates and shows error toasts on failure.
 *
 * @param planId - The ID of the learning plan containing the task.
 * @param taskId - The ID of the task whose status is being updated.
 * @param status - The current progress status of the task.
 * @param onStatusChange - Callback function to optimistically update the status via `useOptimistic`.
 */
export const UpdateTaskStatusButton = (props: UpdateTaskStatusButtonProps) => {
  const { planId, taskId, status, onStatusChange } = props;
  const isCompleted = status === 'completed';
  const [isPending, startTransition] = useTransition();
  const buttonLabel = isCompleted ? 'Completed' : 'Mark Complete';

  /**
   * Handles the click event to toggle the task status between 'not_started' and 'completed'.
   * Uses the `useOptimistic` pattern: the optimistic update runs inside `startTransition`
   * so React automatically reverts on failure. Shows an error toast if the action fails.
   */
  const handleClick = () => {
    if (isPending) {
      return;
    }

    const nextStatus: ProgressStatus = isCompleted
      ? 'not_started'
      : 'completed';

    startTransition(async () => {
      onStatusChange(taskId, nextStatus);
      try {
        await updateTaskProgressAction({ planId, taskId, status: nextStatus });
      } catch {
        toast.error('Failed to update task status. Please try again.');
      }
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
      className={`flex items-center rounded-xl border px-4 py-2 text-left text-sm font-medium ${
        isCompleted
          ? 'border-green-600 bg-green-600 text-white hover:bg-green-700 dark:border-green-500 dark:bg-green-500 dark:text-green-950 dark:hover:bg-green-400'
          : 'border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground'
      }`}
    >
      <div className="flex items-center gap-2">
        {isPending ? (
          <Loader2Icon className="h-5 w-5 animate-spin" />
        ) : isCompleted ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <CircleX className="h-5 w-5" />
        )}
        {isPending ? 'Updating…' : buttonLabel}
      </div>
    </Button>
  );
};
