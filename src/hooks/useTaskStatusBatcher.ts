'use client';

import type { ProgressStatus } from '@/shared/types/db.types';

import { getLoggableErrorDetails } from '@/lib/errors';
import { clientLogger } from '@/lib/logging/client';
import { useCallback, useEffect, useMemo, useRef } from 'react';
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

function scopedTaskIdsKey(
  scopedTaskIds: ReadonlySet<string> | undefined,
): string {
  if (!scopedTaskIds) return '';
  return [...scopedTaskIds].sort().join('\0');
}

function partitionPendingByScope(
  entries: Array<[string, PendingUpdate]>,
  allowed: ReadonlySet<string> | undefined,
): {
  inScope: Array<[string, PendingUpdate]>;
  droppedCount: number;
} {
  if (!allowed) {
    return { inScope: entries, droppedCount: 0 };
  }

  const inScope: Array<[string, PendingUpdate]> = [];
  let droppedCount = 0;

  for (const entry of entries) {
    if (allowed.has(entry[0])) {
      inScope.push(entry);
      continue;
    }
    droppedCount += 1;
    for (const resolver of entry[1].resolvers) {
      resolver.resolve();
    }
  }

  return { inScope, droppedCount };
}

function notifyDroppedTaskUpdates(droppedCount: number, context: string): void {
  if (droppedCount === 0) return;

  clientLogger.warn(`Dropped out-of-scope task progress updates (${context})`, {
    droppedCount,
  });
  toast.message('Some progress changes were not saved after navigation.', {
    description: 'Refresh the page if totals look out of date.',
  });
}

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
  const scopeKey = useMemo(
    () => scopedTaskIdsKey(scopedTaskIds),
    [scopedTaskIds],
  );
  const previousScopeKeyRef = useRef('');

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

    const { inScope: inScopeEntries, droppedCount } = partitionPendingByScope(
      Array.from(snapshot.entries()),
      scopedTaskIdsRef.current,
    );
    notifyDroppedTaskUpdates(droppedCount, 'flush');

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

  const dropOutOfScopePending = useCallback(() => {
    const pending = pendingRef.current;
    if (pending.size === 0) return;

    const { inScope, droppedCount } = partitionPendingByScope(
      Array.from(pending.entries()),
      scopedTaskIdsRef.current,
    );

    pending.clear();
    for (const [taskId, entry] of inScope) {
      pending.set(taskId, entry);
    }

    notifyDroppedTaskUpdates(droppedCount, 'scope-change');

    if (pending.size === 0) {
      clearScheduledFlush();
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
    const previousScopeKey = previousScopeKeyRef.current;
    if (previousScopeKey !== scopeKey && previousScopeKey !== '') {
      void flush().then(() => {
        dropOutOfScopePending();
      });
    } else {
      dropOutOfScopePending();
    }
    previousScopeKeyRef.current = scopeKey;
  }, [dropOutOfScopePending, flush, scopeKey]);

  useEffect(() => {
    return () => {
      void flush();
    };
  }, [flush]);

  return { queue };
}
