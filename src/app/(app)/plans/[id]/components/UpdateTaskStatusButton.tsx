'use client';

import { CheckCircle2, CircleDashed } from 'lucide-react';
import type { JSX } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ProgressStatus } from '@/shared/types/db.types';

interface UpdateTaskStatusButtonProps {
  taskId: string;
  status: ProgressStatus;
  onStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
}

/**
 * Presentational button for toggling task completion on the plan overview page.
 * Calls onStatusChange on click; the parent handles optimistic updates, batching,
 * and error recovery.
 */
export const UpdateTaskStatusButton = (
  props: UpdateTaskStatusButtonProps,
): JSX.Element => {
  const { taskId, status, onStatusChange } = props;
  const isCompleted = status === 'completed';
  const buttonLabel = isCompleted ? 'Completed' : 'Mark Complete';

  const handleClick = () => {
    const nextStatus: ProgressStatus = isCompleted
      ? 'not_started'
      : 'completed';
    onStatusChange(taskId, nextStatus);
  };

  return (
    <Button
      onClick={handleClick}
      aria-pressed={isCompleted}
      aria-label={
        isCompleted ? 'Mark task as incomplete' : 'Mark task as complete'
      }
      className={cn(
        'flex items-center rounded-xl border px-4 py-2 text-left text-sm font-medium',
        isCompleted
          ? 'border-success bg-success text-success-foreground hover:bg-success/90 dark:border-success dark:bg-success dark:hover:bg-success/90'
          : 'border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <div className="flex items-center gap-2">
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <CircleDashed className="h-5 w-5" />
        )}
        {buttonLabel}
      </div>
    </Button>
  );
};
