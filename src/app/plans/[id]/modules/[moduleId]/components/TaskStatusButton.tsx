'use client';

import type { JSX } from 'react';

import { Button } from '@/components/ui/button';
import type { ProgressStatus } from '@/lib/types/db.types';
import { CheckCircle2, Circle } from 'lucide-react';

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
      className={`flex items-center rounded-xl px-4 py-2 text-sm font-medium transition-all ${
        isCompleted
          ? 'bg-green-500 text-white hover:bg-green-600'
          : 'hover:bg-primary bg-white/50 text-stone-700 hover:text-white dark:bg-stone-800/50 dark:text-stone-300'
      }`}
    >
      <div className="flex items-center gap-2">
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <Circle className="h-5 w-5" />
        )}
        {isCompleted ? 'Completed' : 'Mark Complete'}
      </div>
    </Button>
  );
}
