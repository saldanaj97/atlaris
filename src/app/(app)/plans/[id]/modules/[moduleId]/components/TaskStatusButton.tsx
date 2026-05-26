'use client';

import type { ProgressStatus } from '@/shared/types/db.types';
import type { JSX } from 'react';

import { TaskCompletionButton } from '@/app/(app)/plans/[id]/components/TaskCompletionButton';

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
  return (
    <TaskCompletionButton
      taskId={taskId}
      status={status}
      onStatusChange={onStatusChange}
      disabled={disabled}
      variant='lesson'
    />
  );
}
