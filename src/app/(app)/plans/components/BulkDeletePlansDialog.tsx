'use client';

import type { PlanListItem } from '@/features/plans/read-projection/types';
import type { BulkRemovePlanResult } from '@/features/plans/write-service';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { parseApiErrorResponse } from '@/lib/api/error-response';
import { isAbortError } from '@/lib/errors';
import { clientLogger } from '@/lib/logging/client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export type BulkDeletePlansResult = {
  success: boolean;
  deletedCount: number;
  failedCount: number;
  results: BulkRemovePlanResult[];
};

type BulkDeletePlansDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: Pick<PlanListItem, 'id' | 'topic' | 'status'>[];
  onDeleted: (result: BulkDeletePlansResult) => void;
};

type BulkDeleteRequestResult =
  | { kind: 'success'; result: BulkDeletePlansResult }
  | { kind: 'aborted' }
  | { kind: 'error'; message: string; error: unknown };

function startBulkDeleteRequest(abortControllerRef: {
  current: AbortController | null;
}): AbortController {
  abortControllerRef.current?.abort();
  const controller = new AbortController();
  abortControllerRef.current = controller;
  return controller;
}

async function requestBulkPlanDeletion(
  planIds: string[],
  signal: AbortSignal,
): Promise<BulkDeleteRequestResult> {
  try {
    const res = await fetch('/api/v1/plans/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planIds }),
      signal,
    });

    if (!res.ok) {
      const parsed = await parseApiErrorResponse(
        res,
        'Failed to delete selected plans',
      );
      return {
        kind: 'error',
        message: parsed.error,
        error: new Error(parsed.error),
      };
    }

    return {
      kind: 'success',
      result: (await res.json()) as BulkDeletePlansResult,
    };
  } catch (error: unknown) {
    if (isAbortError(error)) {
      return { kind: 'aborted' };
    }

    return {
      kind: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to delete selected plans',
      error,
    };
  }
}

function finalizeBulkDeleteRequest({
  controller,
  abortControllerRef,
  isMountedRef,
  setDeleting,
}: {
  controller: AbortController;
  abortControllerRef: { current: AbortController | null };
  isMountedRef: { current: boolean };
  setDeleting: (value: boolean) => void;
}): void {
  if (abortControllerRef.current !== controller) {
    return;
  }

  abortControllerRef.current = null;
  if (isMountedRef.current) {
    setDeleting(false);
  }
}

function formatPlanTopicList(plans: Pick<PlanListItem, 'topic'>[]): string {
  const preview = plans.slice(0, 5).map((plan) => plan.topic);
  const remaining = plans.length - preview.length;

  if (remaining > 0) {
    return `${preview.join(', ')}, and ${remaining} more`;
  }

  return preview.join(', ');
}

export function BulkDeletePlansDialog({
  open,
  onOpenChange,
  plans,
  onDeleted,
}: BulkDeletePlansDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  const handleDelete = async (): Promise<void> => {
    if (deleting || plans.length === 0) {
      return;
    }

    const controller = startBulkDeleteRequest(abortControllerRef);
    setDeleting(true);
    const result = await requestBulkPlanDeletion(
      plans.map((plan) => plan.id),
      controller.signal,
    );

    switch (result.kind) {
      case 'success':
        finalizeBulkDeleteRequest({
          controller,
          abortControllerRef,
          isMountedRef,
          setDeleting,
        });
        if (isMountedRef.current) {
          onOpenChange(false);
          onDeleted(result.result);
        }
        return;
      case 'aborted':
        finalizeBulkDeleteRequest({
          controller,
          abortControllerRef,
          isMountedRef,
          setDeleting,
        });
        return;
      case 'error':
        clientLogger.error('Bulk plan deletion failed', {
          planIds: plans.map((plan) => plan.id),
          error: result.error,
        });
        toast.error(result.message);
        finalizeBulkDeleteRequest({
          controller,
          abortControllerRef,
          isMountedRef,
          setDeleting,
        });
        return;
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete selected plans</AlertDialogTitle>
          <AlertDialogDescription className='space-y-2'>
            <p>
              This will permanently delete {plans.length} selected plan
              {plans.length === 1 ? '' : 's'} and all associated modules, tasks,
              progress, schedules, and generation history. This action cannot be
              undone and you will not receive a refund for the AI generation
              credits used to generate these plans.
            </p>
            <p>Selected: {formatPlanTopicList(plans)}</p>
            <p>Are you sure you want to delete these plans?</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            disabled={deleting || plans.length === 0}
            onClick={(event) => {
              event.preventDefault();
              void handleDelete();
            }}
          >
            {deleting ? 'Deleting...' : `Delete ${plans.length} plans`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
