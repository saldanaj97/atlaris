'use client';

import type { ProgressStatus } from '@/shared/types/db.types';
import type { JSX } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, CircleDashed } from 'lucide-react';

interface TaskCompletionButtonProps {
  taskId: string;
  status: ProgressStatus;
  onStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
  disabled?: boolean;
  variant: 'timeline' | 'lesson';
}

export function TaskCompletionButton({
  taskId,
  status,
  onStatusChange,
  disabled = false,
  variant,
}: TaskCompletionButtonProps): JSX.Element {
  const isCompleted = status === 'completed';
  const buttonLabel = isCompleted ? 'Completed' : 'Mark Complete';

  const handleClick = () => {
    const nextStatus: ProgressStatus = isCompleted
      ? 'not_started'
      : 'completed';
    onStatusChange(taskId, nextStatus);
  };

  const IncompleteIcon = variant === 'timeline' ? CircleDashed : Circle;

  return (
    <Button
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={isCompleted}
      aria-label={
        isCompleted ? 'Mark task as incomplete' : 'Mark task as complete'
      }
      className={cn(
        variant === 'timeline' ? 'rounded-md px-4' : 'rounded-lg px-4',
        variant === 'timeline'
          ? 'border text-left'
          : 'transition-[background-color,color,border-color,box-shadow]',
        isCompleted
          ? variant === 'timeline'
            ? 'border-success bg-success text-success-foreground hover:bg-success/90 dark:border-success dark:bg-success dark:hover:bg-success/90'
            : 'bg-success text-success-foreground hover:bg-success/90'
          : variant === 'timeline'
            ? 'border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground'
            : 'bg-white/50 text-foreground hover:bg-primary hover:text-primary-foreground dark:bg-card/50 dark:text-muted-foreground dark:hover:bg-primary dark:hover:text-primary-foreground',
      )}
    >
      {isCompleted ? (
        <CheckCircle2 className='size-5' />
      ) : (
        <IncompleteIcon className='size-5' />
      )}
      {buttonLabel}
    </Button>
  );
}
