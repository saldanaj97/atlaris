'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import type { JSX } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ProgressStatus } from '@/shared/types/db.types';

interface TaskStatusButtonProps {
  taskId: string;
  status: ProgressStatus;
  onStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
  disabled?: boolean;
}

/**
 * Presentational button for toggling task completion. Calls onStatusChange on click;
 * the parent handles optimistic updates, batching, and error recovery.
 */
export function TaskStatusButton({
  taskId,
  status,
  onStatusChange,
  disabled = false,
}: TaskStatusButtonProps): JSX.Element {
  const isCompleted = status === 'completed';

  const handleClick = () => {
    const nextStatus: ProgressStatus = isCompleted
      ? 'not_started'
      : 'completed';
    onStatusChange(taskId, nextStatus);
  };

  return (
    <Button
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={isCompleted}
      aria-label={
        isCompleted ? 'Mark task as incomplete' : 'Mark task as complete'
      }
      className={cn(
        'rounded-xl px-4 transition-all',
        isCompleted
          ? 'bg-success text-success-foreground hover:bg-success/90'
          : 'bg-white/50 text-foreground hover:bg-primary hover:text-primary-foreground dark:bg-card/50 dark:text-muted-foreground dark:hover:bg-primary dark:hover:text-primary-foreground',
      )}
    >
      {isCompleted ? (
        <CheckCircle2 className="h-5 w-5" />
      ) : (
        <Circle className="h-5 w-5" />
      )}
      {isCompleted ? 'Completed' : 'Mark Complete'}
    </Button>
  );
}
