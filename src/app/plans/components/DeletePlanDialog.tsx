'use client';

import { type ReactElement, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { parseApiErrorResponse } from '@/lib/api/error-response';
import { isAbortError } from '@/lib/errors';
import { clientLogger } from '@/lib/logging/client';

interface DeletePlanDialogProps {
  planId: string;
  planTopic: string;
  isGenerating: boolean;
  /** Where to navigate after successful deletion. Defaults to '/plans'. */
  redirectTo?: string;
  children: ReactElement;
}

export function DeletePlanDialog({
  planId,
  planTopic,
  isGenerating,
  redirectTo = '/plans',
  children,
}: DeletePlanDialogProps): ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleDelete = useCallback(async (): Promise<void> => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/plans/${planId}`, {
        method: 'DELETE',
        signal: controller.signal,
      });

      if (!res.ok) {
        const parsed = await parseApiErrorResponse(
          res,
          'Failed to delete plan'
        );
        throw new Error(parsed.error);
      }

      toast.success('Plan deleted successfully');
      setOpen(false);
      router.push(redirectTo);
      router.refresh();
    } catch (error: unknown) {
      if (isAbortError(error)) return;
      const message =
        error instanceof Error ? error.message : 'Failed to delete plan';
      clientLogger.error('Plan deletion failed', { planId, error });
      toast.error(message);
    } finally {
      if (abortControllerRef.current === controller) {
        setDeleting(false);
        abortControllerRef.current = null;
      }
    }
  }, [planId, redirectTo, router]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild disabled={isGenerating}>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete plan</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete &quot;{planTopic}&quot; and all its
            modules, tasks, and progress. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
          >
            {deleting ? 'Deleting…' : 'Delete plan'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
