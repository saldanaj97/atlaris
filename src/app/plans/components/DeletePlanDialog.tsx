'use client';

import { useRouter } from 'next/navigation';
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
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

interface DeletePlanDialogBaseProps {
  planId: string;
  planTopic: string;
  isGenerating: boolean;
  /** Where to navigate after successful deletion. Defaults to '/plans'. */
  redirectTo?: string;
}

/** Controlled mode: parent owns open state; no trigger child is rendered. */
type DeletePlanDialogControlledProps = DeletePlanDialogBaseProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: never;
};

/** Uncontrolled mode: component owns open state; a trigger child is required. */
type DeletePlanDialogUncontrolledProps = DeletePlanDialogBaseProps & {
  open?: never;
  onOpenChange?: never;
  children: ReactElement;
};

type DeletePlanDialogProps =
  | DeletePlanDialogControlledProps
  | DeletePlanDialogUncontrolledProps;

export function DeletePlanDialog({
  planId,
  planTopic,
  isGenerating,
  redirectTo = '/plans',
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  children,
}: DeletePlanDialogProps): ReactElement {
  const router = useRouter();
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = useCallback(
    (value: boolean) => {
      if (isControlled) {
        controlledOnOpenChange?.(value);
      } else {
        setInternalOpen(value);
      }
    },
    [isControlled, controlledOnOpenChange]
  );
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

  const handleDelete = useCallback(async (): Promise<void> => {
    if (isGenerating || deleting) {
      return;
    }

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
      if (isMountedRef.current) {
        setOpen(false);
      }
      router.push(redirectTo);
      router.refresh();
      return; // navigation initiated; skip post-navigation state cleanup below
    } catch (error: unknown) {
      if (isAbortError(error)) {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
          if (isMountedRef.current) {
            setDeleting(false);
          }
        }
        return;
      }
      const message =
        error instanceof Error ? error.message : 'Failed to delete plan';
      clientLogger.error('Plan deletion failed', { planId, error });
      toast.error(message);
    }

    if (abortControllerRef.current === controller) {
      abortControllerRef.current = null;
      if (isMountedRef.current) {
        setDeleting(false);
      }
    }
  }, [deleting, isGenerating, planId, redirectTo, router, setOpen]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {!isControlled && children && (
        <AlertDialogTrigger asChild disabled={isGenerating}>
          {children}
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete plan</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              This will permanently delete &quot;{planTopic}&quot; and all its
              modules, tasks, and progress. This action cannot be undone and you
              will not receive a refund for the AI generation credit used to
              generate this plan.
            </p>
            <p>Are you sure you want to delete this plan?</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting || isGenerating}
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
