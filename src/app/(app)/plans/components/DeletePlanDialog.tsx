'use client';

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
import { isPostHogEnabledInCurrentEnvironment } from '@/lib/config/env/posthog';
import { isAbortError } from '@/lib/errors';
import { clientLogger } from '@/lib/logging/client';
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';
import {
  type ReactElement,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

interface DeletePlanDialogBaseProps {
  planId: string;
  planTopic: string;
  isGenerating: boolean;
  /** Where to navigate after successful deletion. Defaults to '/plans'. */
  redirectTo?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
  successFocusRef?: RefObject<HTMLElement | null>;
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

type DeletePlanRequestResult =
  | { kind: 'success' }
  | { kind: 'aborted' }
  | { kind: 'error'; message: string; error: unknown; outcomeUnknown?: true };

function startDeleteRequest(abortControllerRef: {
  current: AbortController | null;
}): AbortController {
  abortControllerRef.current?.abort();
  const controller = new AbortController();
  abortControllerRef.current = controller;
  return controller;
}

async function requestPlanDeletion(
  planId: string,
  signal: AbortSignal,
): Promise<DeletePlanRequestResult> {
  try {
    const res = await fetch(`/api/v1/plans/${planId}`, {
      method: 'DELETE',
      signal,
    });

    if (!res.ok) {
      const parsed = await parseApiErrorResponse(res, 'Failed to delete plan');
      return {
        kind: 'error',
        message: parsed.error,
        error: new Error(parsed.error),
      };
    }

    return { kind: 'success' };
  } catch (error: unknown) {
    if (isAbortError(error)) {
      return { kind: 'aborted' };
    }

    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Failed to delete plan',
      error,
      outcomeUnknown: true,
    };
  }
}

function finalizeDeleteRequest({
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

function completeDeleteSuccess({
  isMountedRef,
  setOpen,
  router,
  redirectTo,
}: {
  isMountedRef: { current: boolean };
  setOpen: (value: boolean) => void;
  router: ReturnType<typeof useRouter>;
  redirectTo: string;
}): void {
  toast.success('Plan deleted successfully');
  if (isMountedRef.current) {
    setOpen(false);
  }
  router.push(redirectTo);
  router.refresh();
}

export function DeletePlanDialog({
  planId,
  planTopic,
  isGenerating,
  redirectTo = '/plans',
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  returnFocusRef,
  successFocusRef,
  children,
}: DeletePlanDialogProps): ReactElement {
  const router = useRouter();
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (!value) {
      setErrorMessage(null);
    }
    if (isControlled) {
      controlledOnOpenChange?.(value);
    } else {
      setInternalOpen(value);
    }
  };
  const [deleting, setDeleting] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const focusAfterCloseRef = useRef<'return' | 'success'>('return');

  // react-doctor-disable-next-line react-doctor/exhaustive-deps -- mount cleanup intentionally flips the mounted ref and aborts the active request.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  const handleDelete = async (): Promise<void> => {
    if (isGenerating || deleting) {
      return;
    }

    const controller = startDeleteRequest(abortControllerRef);
    setDeleting(true);
    setErrorMessage(null);

    const result = await requestPlanDeletion(planId, controller.signal);

    switch (result.kind) {
      case 'success':
        if (isPostHogEnabledInCurrentEnvironment()) {
          posthog.capture('plan_deletion_confirmed', { plan_id: planId });
        }
        focusAfterCloseRef.current = 'success';
        finalizeDeleteRequest({
          controller,
          abortControllerRef,
          isMountedRef,
          setDeleting,
        });
        completeDeleteSuccess({
          isMountedRef,
          setOpen,
          router,
          redirectTo,
        });
        return;
      case 'aborted':
        finalizeDeleteRequest({
          controller,
          abortControllerRef,
          isMountedRef,
          setDeleting,
        });
        return;
      case 'error':
        clientLogger.error('Plan deletion failed', {
          planId,
          error: result.error,
        });
        finalizeDeleteRequest({
          controller,
          abortControllerRef,
          isMountedRef,
          setDeleting,
        });
        if (result.outcomeUnknown) {
          toast.error(result.message);
          return;
        }
        if (isMountedRef.current) {
          setErrorMessage(result.message);
        }
        return;
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {!isControlled && children && (
        <AlertDialogTrigger asChild disabled={isGenerating}>
          {children}
        </AlertDialogTrigger>
      )}
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          const preferredTarget =
            focusAfterCloseRef.current === 'success'
              ? successFocusRef?.current
              : returnFocusRef?.current;
          const fallbackTarget = returnFocusRef?.current;
          const target =
            preferredTarget?.isConnected &&
            !preferredTarget.hasAttribute('disabled')
              ? preferredTarget
              : fallbackTarget;

          focusAfterCloseRef.current = 'return';
          if (target?.isConnected && !target.hasAttribute('disabled')) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Delete plan</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className='space-y-2'>
              <p>
                This will permanently delete &quot;{planTopic}&quot; and all its
                modules, tasks, and progress. This action cannot be undone and
                you will not receive a refund for the AI generation credit used
                to generate this plan.
              </p>
              <p>Are you sure you want to delete this plan?</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {errorMessage ? (
          <p
            role='alert'
            className='rounded-lg border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger'
          >
            {errorMessage}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            aria-busy={deleting}
            aria-live='polite'
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
