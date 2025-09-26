'use client';

import { updateTaskProgressAction } from '@/app/plans/[id]/actions';
import { Button } from '@/components/ui/button';
import { ProgressStatus } from '@/lib/types/db';
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
 * It toggles between 'not_started' and 'completed' statuses, with optimistic UI updates
 * and server-side persistence via a server action. Displays a loading state during updates
 * and shows error toasts on failure.
 *
 * @param planId - The ID of the learning plan containing the task.
 * @param taskId - The ID of the task whose status is being updated.
 * @param status - The current progress status of the task.
 * @param onStatusChange - Callback function to update the status in the parent component's state.
 */
export const UpdateTaskStatusButton = (props: UpdateTaskStatusButtonProps) => {
  const { planId, taskId, status, onStatusChange } = props;
  const isCompleted = status === 'completed';
  const [isPending, startTransition] = useTransition();

  /**
   * Handles the click event to toggle the task status between 'not_started' and 'completed'.
   * Performs optimistic UI updates and calls the server action for persistence.
   * Reverts the status on error and displays a toast notification.
   */
  const handleClick = () => {
    // Prevent multiple clicks while pending
    if (isPending) {
      return;
    }

    // Store the previous status and determine the next status
    const previousStatus = status;
    const nextStatus: ProgressStatus = isCompleted
      ? 'not_started'
      : 'completed';

    // Optimistically update the UI
    onStatusChange(taskId, nextStatus);

    // Call the server action to update the status
    startTransition(() => {
      updateTaskProgressAction({ planId, taskId, status: nextStatus }).catch(
        () => {
          onStatusChange(taskId, previousStatus);
          toast.error('Failed to update task status. Please try again.');
        }
      );
    });
  };

  return (
    <Button
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={isCompleted}
      aria-disabled={isPending || undefined}
      aria-label={
        isCompleted ? 'Mark task as not started' : 'Mark task as completed'
      }
      className={`flex items-center rounded-xl px-4 py-2 text-left text-sm font-medium ${
        isCompleted
          ? 'text-secondary hover:bg-secondary hover:text-primary bg-green-500'
          : 'text-muted-foreground bg-secondary hover:text-secondary hover:bg-green-500'
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
        Completed
      </div>
    </Button>
  );
};
