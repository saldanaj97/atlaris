'use client';

import type { RegenerationReason } from '@/features/plans/regeneration-orchestration/reasons';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ROUTES } from '@/features/navigation/routes';
import {
  MAX_REGENERATION_NOTE_LENGTH,
  REGENERATION_REASON_LABELS,
  REGENERATION_REASONS,
} from '@/features/plans/regeneration-orchestration/reasons';
import { parseApiErrorResponse } from '@/lib/api/error-response';
import { isAbortError } from '@/lib/errors';
import { clientLogger } from '@/lib/logging/client';
import { API_ERROR_CODES } from '@/shared/constants/api-error-codes';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Loader2, RefreshCw, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactElement, useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';

type SubmitError = { message: string; upgrade?: boolean };

/** Plain-language copy for the regenerate route's known refusals. */
function toSubmitError(
  status: number,
  parsed: { error: string; code: string },
): SubmitError {
  switch (parsed.code) {
    case API_ERROR_CODES.REGENERATION_QUOTA_EXCEEDED:
      return {
        message:
          "You've reached your regeneration limit for this plan or this month.",
      };
    case API_ERROR_CODES.PLAN_REGENERATION_NOT_INCLUDED:
      return {
        message: 'Regenerating plans is not included on your plan.',
        upgrade: true,
      };
    case 'SERVICE_UNAVAILABLE':
      return {
        message: 'Regeneration is unavailable right now. Try again later.',
      };
    default:
      return status === 429
        ? { message: 'Too many requests. Wait a moment and try again.' }
        : { message: parsed.error };
  }
}

interface RegeneratePlanDialogProps {
  planId: string;
}

/**
 * "Regenerate plan" trigger and dialog (JCS-162): reason chips and an
 * optional note, posted to the regenerate route. On success the page
 * refreshes into its server-backed "Regenerating" state.
 */
export function RegeneratePlanDialog({
  planId,
}: RegeneratePlanDialogProps): ReactElement {
  const router = useRouter();
  const noteId = useId();
  const noteHelpId = useId();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [reasons, setReasons] = useState<RegenerationReason[]>([]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<SubmitError | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    [],
  );

  function handleOpenChange(next: boolean): void {
    if (submitting) {
      return;
    }
    if (!next) {
      setError(null);
    }
    setOpen(next);
  }

  function toggleReason(reason: RegenerationReason, checked: boolean): void {
    setReasons((current) =>
      checked
        ? REGENERATION_REASONS.filter(
            (value) => value === reason || current.includes(value),
          )
        : current.filter((value) => value !== reason),
    );
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setSubmitting(true);
    setError(null);

    const trimmedNote = note.trim();
    // Clears the busy state unless a newer submit took over (no `finally`:
    // React Compiler cannot lower it).
    const settle = (): void => {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setSubmitting(false);
      }
    };
    try {
      const res = await fetch(`/api/v1/plans/${planId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reasons,
          ...(trimmedNote !== '' && { note: trimmedNote }),
        }),
        signal: controller.signal,
      });

      if (res.ok) {
        settle();
        toast.success(
          'Regenerating your plan. The new version replaces this one when it is ready.',
        );
        setOpen(false);
        router.refresh();
        return;
      }

      const parsed = await parseApiErrorResponse(
        res,
        'Could not start regeneration.',
      );
      settle();
      if (parsed.code === 'REGENERATION_ALREADY_QUEUED') {
        toast.message('This plan is already regenerating.');
        setOpen(false);
        router.refresh();
        return;
      }
      setError(toSubmitError(res.status, parsed));
    } catch (caught: unknown) {
      settle();
      if (isAbortError(caught)) {
        return;
      }
      clientLogger.error('Plan regeneration request failed', {
        planId,
        error: caught,
      });
      // The request may have reached the server; the refresh shows the truth.
      toast.error(
        'We could not confirm whether regeneration started. Refreshing the plan.',
      );
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Trigger asChild>
        <Button variant='outline'>
          <RefreshCw aria-hidden='true' />
          Regenerate plan
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className='fixed inset-0 z-[51] bg-black/72 transition-opacity duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none motion-reduce:transition-none' />
        <DialogPrimitive.Content className='fixed top-[50%] left-[50%] z-[52] grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[32rem] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto overscroll-contain rounded-2xl border border-input bg-popover p-4 text-popover-foreground shadow-xl transition-opacity duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none motion-reduce:transition-none sm:p-6'>
          <div className='grid gap-2 pr-10'>
            <DialogPrimitive.Title className='type-card text-foreground'>
              Regenerate plan
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className='type-body text-muted-foreground'>
              Tell us what to change. The new version replaces this plan and its
              progress when it is ready.
            </DialogPrimitive.Description>
          </div>

          <form
            className='grid gap-5'
            onSubmit={(event) => void handleSubmit(event)}
            aria-describedby={error ? errorId : undefined}
          >
            <fieldset className='grid gap-3' disabled={submitting}>
              <legend className='mb-3 type-label text-foreground'>
                What should change?{' '}
                <span className='text-muted-foreground'>(optional)</span>
              </legend>
              <div className='flex flex-wrap gap-2'>
                {REGENERATION_REASONS.map((reason) => (
                  <label
                    key={reason}
                    className='inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-input bg-card px-4 type-body text-foreground transition-colors select-none hover:border-muted-foreground has-checked:border-action-primary has-checked:bg-action-primary/12 has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background has-disabled:cursor-not-allowed has-disabled:opacity-60 motion-reduce:transition-none'
                  >
                    <input
                      type='checkbox'
                      className='size-4 accent-action-primary'
                      checked={reasons.includes(reason)}
                      onChange={(event) =>
                        toggleReason(reason, event.target.checked)
                      }
                    />
                    {REGENERATION_REASON_LABELS[reason]}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className='grid gap-2'>
              <Label htmlFor={noteId}>
                Anything else?{' '}
                <span className='text-muted-foreground'>(optional)</span>
              </Label>
              <Textarea
                id={noteId}
                value={note}
                maxLength={MAX_REGENERATION_NOTE_LENGTH}
                disabled={submitting}
                aria-describedby={noteHelpId}
                placeholder='For example: more hands-on projects, less theory.'
                onChange={(event) => setNote(event.target.value)}
              />
              <p
                id={noteHelpId}
                className='type-meta text-muted-foreground tabular-nums'
              >
                {note.length}/{MAX_REGENERATION_NOTE_LENGTH} characters
              </p>
            </div>

            {error ? (
              <p
                id={errorId}
                role='alert'
                className='rounded-lg border border-danger bg-danger-subtle px-3 py-2 type-body text-danger'
              >
                {error.message}{' '}
                {error.upgrade ? (
                  <Link href={ROUTES.PRICING} className='underline'>
                    See plans
                  </Link>
                ) : null}
              </p>
            ) : null}

            <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
              <DialogPrimitive.Close asChild>
                <Button type='button' variant='outline' disabled={submitting}>
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <Button
                type='submit'
                aria-busy={submitting}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2
                    aria-hidden='true'
                    className='animate-spin motion-reduce:animate-none'
                  />
                ) : null}
                Regenerate plan
              </Button>
            </div>
          </form>

          <DialogPrimitive.Close
            disabled={submitting}
            className='absolute top-2 right-2 flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:pointer-events-none sm:top-4 sm:right-4'
          >
            <XIcon aria-hidden='true' className='size-4' />
            <span className='sr-only'>Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
