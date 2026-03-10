'use client';

import { useCallback, useEffect, useRef } from 'react';

import { getLoggableErrorDetails } from '@/lib/errors';
import { clientLogger } from '@/lib/logging/client';
import type { ProgressStatus } from '@/lib/types/db';
import { toast } from 'sonner';

interface Resolver {
  resolve: () => void;
  reject: (error: unknown) => void;
}

interface PendingUpdate {
  originalStatus: ProgressStatus;
  targetStatus: ProgressStatus;
  resolvers: Resolver[];
}

export interface TaskStatusUpdate {
  taskId: string;
  status: ProgressStatus;
}

interface UseTaskStatusBatcherOptions {
  flushAction: (updates: TaskStatusUpdate[]) => Promise<void>;
  debounceMs?: number;
  maxWaitMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 2000;
const DEFAULT_MAX_WAIT_MS = 5000;

/**
 * Batches task status updates within a debounce window into a single server request.
 * Returns a `queue` function that returns a Promise resolving/rejecting when the batch flushes.
 *
 * - Deduplicates: multiple clicks on the same task keep only the latest target status.
 * - Net-zero detection: if a task is toggled back to its original status, it's removed
 *   from the batch entirely and both promises resolve immediately.
 * - Shows a single toast on batch failure.
 * - Flushes pending updates on unmount to prevent data loss on navigation.
 */
export function useTaskStatusBatcher({
  flushAction,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
}: UseTaskStatusBatcherOptions): {
  queue: (
    taskId: string,
    nextStatus: ProgressStatus,
    previousStatus: ProgressStatus
  ) => Promise<void>;
} {
  const pendingRef = useRef<Map<string, PendingUpdate>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstQueuedAtRef = useRef<number | null>(null);
  const flushActionRef = useRef(flushAction);
  flushActionRef.current = flushAction;

  const clearScheduledFlush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }

    firstQueuedAtRef.current = null;
  }, []);

  const flush = useCallback(async () => {
    clearScheduledFlush();

    const pending = pendingRef.current;
    if (pending.size === 0) return;

    const snapshot = new Map(pending);
    pending.clear();

    const updates: TaskStatusUpdate[] = Array.from(snapshot.entries()).map(
      ([taskId, { targetStatus }]) => ({ taskId, status: targetStatus })
    );

    try {
      await flushActionRef.current(updates);
      for (const [, { resolvers }] of snapshot) {
        for (const r of resolvers) r.resolve();
      }
    } catch (error) {
      for (const [, { resolvers }] of snapshot) {
        for (const r of resolvers) r.reject(error);
      }
      const { errorMessage, errorStack } = getLoggableErrorDetails(error);
      clientLogger.error('Failed to batch update task statuses', {
        errorMessage,
        errorStack,
        updateCount: updates.length,
      });
      toast.error('Failed to update task status. Please try again.');
    }
  }, [clearScheduledFlush]);

  const queue = useCallback(
    (
      taskId: string,
      nextStatus: ProgressStatus,
      previousStatus: ProgressStatus
    ): Promise<void> => {
      return new Promise<void>((resolve, reject) => {
        const pending = pendingRef.current;

        const existing = pending.get(taskId);
        if (existing) {
          existing.resolvers.push({ resolve, reject });

          if (nextStatus === existing.originalStatus) {
            // Net zero — user toggled back to original. Resolve all and drop.
            for (const r of existing.resolvers) r.resolve();
            pending.delete(taskId);
            if (pending.size === 0) {
              clearScheduledFlush();
            }
            return;
          }

          existing.targetStatus = nextStatus;
        } else {
          pending.set(taskId, {
            originalStatus: previousStatus,
            targetStatus: nextStatus,
            resolvers: [{ resolve, reject }],
          });
        }

        const now = Date.now();
        if (firstQueuedAtRef.current === null) {
          firstQueuedAtRef.current = now;
        }
        const firstQueuedAt = firstQueuedAtRef.current;

        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => {
          void flush();
        }, debounceMs);

        if (maxTimerRef.current === null) {
          const elapsedMs = now - firstQueuedAt;
          const remainingMs = Math.max(maxWaitMs - elapsedMs, 0);
          maxTimerRef.current = setTimeout(() => {
            void flush();
          }, remainingMs);
        }
      });
    },
    [clearScheduledFlush, debounceMs, flush, maxWaitMs]
  );

  useEffect(() => {
    return () => {
      void flush();
    };
  }, [flush]);

  return { queue };
}
