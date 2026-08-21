'use client';

import type { PlanListItem } from '@/features/plans/read-projection/types';

import { requestJson } from '@/app/_shared/client-api';
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
import { clientLogger } from '@/lib/logging/client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

const bulkRemovePlanResultSchema = z.discriminatedUnion('success', [
  z.object({
    planId: z.string(),
    success: z.literal(true),
  }),
  z.object({
    planId: z.string(),
    success: z.literal(false),
    reason: z.enum([
      'not_found',
      'currently_generating',
      'active_child_generation',
    ]),
    message: z.string(),
  }),
]);

const bulkDeletePlansResultSchema = z.object({
  success: z.boolean(),
  deletedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  results: z.array(bulkRemovePlanResultSchema),
});

const BULK_DELETE_REQUEST_TIMEOUT_MS = 30_000;

export type BulkDeletePlansResult = z.infer<typeof bulkDeletePlansResultSchema>;

type BulkDeletePlansDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: Pick<PlanListItem, 'id' | 'topic' | 'status'>[];
  onDeleted: (result: BulkDeletePlansResult) => void;
  onOutcomeUnknown: () => void;
};

type BulkDeleteRequestResult =
  | { kind: 'success'; result: BulkDeletePlansResult }
  | { kind: 'aborted' }
  | {
      kind: 'error';
      message: string;
      error: unknown;
      outcomeUnknown?: true;
    };

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
  onOutcomeUnknown,
}: BulkDeletePlansDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- unmount cleanup intentionally aborts the active request.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  const handleDelete = async (): Promise<void> => {
    if (deleting || plans.length === 0) {
      return;
    }

    const planIds = plans.map((plan) => plan.id);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setDeleting(true);

    let result: BulkDeleteRequestResult;
    let isCurrentRequest = false;
    try {
      const response = await requestJson({
        url: '/api/v1/plans/bulk-delete',
        init: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planIds }),
          signal: controller.signal,
        },
        schema: bulkDeletePlansResultSchema,
        fallbackMessage: 'Failed to delete selected plans',
        timeoutMs: BULK_DELETE_REQUEST_TIMEOUT_MS,
      });
      result =
        response.kind === 'success'
          ? { kind: 'success', result: response.data }
          : response;
    } catch (error: unknown) {
      result = {
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to delete selected plans',
        error,
      };
    } finally {
      isCurrentRequest = abortControllerRef.current === controller;
      if (isCurrentRequest) {
        abortControllerRef.current = null;
        setDeleting(false);
      }
    }

    if (!isCurrentRequest) return;

    if (result.kind === 'success') {
      onOpenChange(false);
      onDeleted(result.result);
      return;
    }

    if (result.kind === 'error') {
      clientLogger.error('Bulk plan deletion failed', {
        planIds,
        error: result.error,
      });

      if (result.outcomeUnknown) {
        onOpenChange(false);
        onOutcomeUnknown();
        toast.error(
          'We could not confirm whether the selected plans were deleted. Refreshing the list before another deletion.',
        );
        return;
      }

      toast.error(result.message);
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
            {deleting
              ? 'Deleting...'
              : `Delete ${plans.length} plan${plans.length === 1 ? '' : 's'}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
