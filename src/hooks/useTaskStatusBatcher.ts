'use client';

import type { ProgressStatus } from '@/shared/types/db.types';

import { getLoggableErrorDetails } from '@/lib/errors';
import { clientLogger } from '@/lib/logging/client';
import { useCallback, useEffect, useRef } from 'react';
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
  /** When set, pending/flushed updates for unknown task ids are dropped (navigation/regen). */
  scopedTaskIds?: ReadonlySet<string>;
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
  scopedTaskIds,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
}: UseTaskStatusBatcherOptions): {
  queue: (
    taskId: string,
    nextStatus: ProgressStatus,
    previousStatus: ProgressStatus,
  ) => Promise<void>;
} {
  const pendingRef = useRef<Map<string, PendingUpdate>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstQueuedAtRef = useRef<number | null>(null);
  const flushActionRef = useRef(flushAction);
  flushActionRef.current = flushAction;
  const scopedTaskIdsRef = useRef(scopedTaskIds);
  scopedTaskIdsRef.current = scopedTaskIds;

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

  const dropOutOfScopePending = useCallback(() => {
    const allowed = scopedTaskIdsRef.current;
    if (!allowed) return;

    const pending = pendingRef.current;
    let droppedCount = 0;

    for (const [taskId, entry] of pending) {
      if (allowed.has(taskId)) continue;
      droppedCount += 1;
      for (const resolver of entry.resolvers) {
        resolver.resolve();
      }
      pending.delete(taskId);
    }

    if (droppedCount > 0) {
      clientLogger.warn('Dropped out-of-scope task progress updates', {
        droppedCount,
      });
      if (pending.size === 0) {
        clearScheduledFlush();
      }
    }
  }, [clearScheduledFlush]);

  const flush = useCallback(async () => {
    clearScheduledFlush();

    const pending = pendingRef.current;
    if (pending.size === 0) return;

    const snapshot = new Map(pending);
    pending.clear();

    const allowed = scopedTaskIdsRef.current;
    const inScopeEntries: Array<[string, PendingUpdate]> = [];
    let skippedCount = 0;

    for (const entry of snapshot) {
      if (!allowed || allowed.has(entry[0])) {
        inScopeEntries.push(entry);
        continue;
      }
      skippedCount += 1;
      for (const resolver of entry[1].resolvers) {
        resolver.resolve();
      }
    }

    if (skippedCount > 0) {
      clientLogger.warn('Skipped out-of-scope task progress flush', {
        skippedCount,
      });
    }

    if (inScopeEntries.length === 0) return;

    const updates: TaskStatusUpdate[] = inScopeEntries.map(
      ([taskId, { targetStatus }]) => ({ taskId, status: targetStatus }),
    );

    try {
      await flushActionRef.current(updates);
      for (const [, { resolvers }] of inScopeEntries) {
        for (const r of resolvers) r.resolve();
      }
    } catch (error) {
      for (const [, { resolvers }] of inScopeEntries) {
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
      previousStatus: ProgressStatus,
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
    [clearScheduledFlush, debounceMs, flush, maxWaitMs],
  );

  useEffect(() => {
    dropOutOfScopePending();
  }, [dropOutOfScopePending, scopedTaskIds]);

  useEffect(() => {
    return () => {
      void flush();
    };
  }, [flush]);

  return { queue };
}
