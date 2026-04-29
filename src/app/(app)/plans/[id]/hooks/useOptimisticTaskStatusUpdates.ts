'use client';

import {
  useCallback,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useTransition,
} from 'react';
import { useTaskStatusBatcher } from '@/hooks/useTaskStatusBatcher';
import type { ProgressStatus } from '@/shared/types/db.types';

type TaskStatusUpdateErrorContext = {
  error: unknown;
  taskId: string;
  previousStatus: ProgressStatus;
  nextStatus: ProgressStatus;
};

type UseOptimisticTaskStatusUpdatesOptions = {
  initialStatuses: Record<string, ProgressStatus>;
  flushAction: (
    updates: Array<{ taskId: string; status: ProgressStatus }>,
  ) => Promise<void>;
  onError: (context: TaskStatusUpdateErrorContext) => void;
};

export function useOptimisticTaskStatusUpdates({
  initialStatuses,
  flushAction,
  onError,
}: UseOptimisticTaskStatusUpdatesOptions): {
  statuses: Record<string, ProgressStatus>;
  handleStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
} {
  const [statuses, addOptimisticStatus] = useOptimistic(
    initialStatuses,
    (
      current: Record<string, ProgressStatus>,
      update: { taskId: string; status: ProgressStatus },
    ) => ({
      ...current,
      [update.taskId]: update.status,
    }),
  );

  const statusesRef = useRef(statuses);

  useLayoutEffect(() => {
    statusesRef.current = statuses;
  }, [statuses]);

  const [_isPending, startTransition] = useTransition();

  const batcher = useTaskStatusBatcher({ flushAction });

  const handleStatusChange = useCallback(
    (taskId: string, nextStatus: ProgressStatus) => {
      const previousStatus = statusesRef.current[taskId] ?? 'not_started';

      startTransition(async () => {
        addOptimisticStatus({ taskId, status: nextStatus });
        try {
          await batcher.queue(taskId, nextStatus, previousStatus);
        } catch (error: unknown) {
          onError({ error, taskId, previousStatus, nextStatus });
        }
      });
    },
    [addOptimisticStatus, batcher, onError],
  );

  return { statuses, handleStatusChange };
}
