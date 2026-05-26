'use client';

import type { ProgressStatus } from '@/shared/types/db.types';
import type { JSX } from 'react';

import { TaskCompletionButton } from './TaskCompletionButton';

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

  return (
    <TaskCompletionButton
      taskId={taskId}
      status={status}
      onStatusChange={onStatusChange}
      variant='timeline'
    />
  );
};
