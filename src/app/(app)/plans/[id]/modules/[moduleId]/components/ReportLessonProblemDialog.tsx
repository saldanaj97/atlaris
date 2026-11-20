'use client';

import type {
  LessonProblemReason,
  LessonProblemReportField,
} from '@/features/plans/lesson-problem-reports/validation';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { parseApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';
import { API_ERROR_CODES } from '@/shared/constants/api-error-codes';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  LESSON_PROBLEM_REASONS,
  MAX_LESSON_PROBLEM_REPORT_NOTE_LENGTH,
} from '@supabase/schema/constants';
import { Flag, Loader2, XIcon } from 'lucide-react';
import { type ReactElement, useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';

const REQUEST_TIMEOUT_MS = 15_000;

const REASON_COPY: Record<
  LessonProblemReason,
  { label: string; hint: string }
> = {
  incorrect: {
    label: 'Incorrect',
    hint: 'A fact, example or step is wrong.',
  },
  unclear: {
    label: 'Unclear',
    hint: "It's hard to follow or skips a step.",
  },
  broken_source: {
    label: 'Broken source',
    hint: "A source link doesn't open or doesn't back up the lesson.",
  },
  other: {
    label: 'Other',
    hint: 'Something else. Tell us in the details.',
  },
};

const COPY = {
  success: 'Report received. Thanks for letting us know.',
  knownFailure: 'Could not send your report. Try again.',
  accessDenied: 'This lesson is unavailable or you do not have access to it.',
  rateLimited: 'Too many requests. Wait a moment and try again.',
  unknownOutcome: 'We could not confirm that your report was sent. Try again.',
  contentChanged:
    'This lesson changed since you opened it. Refresh the page and try again.',
} as const;

const numberFormat = new Intl.NumberFormat('en-US');
const MAX_NOTE_LABEL = numberFormat.format(
  MAX_LESSON_PROBLEM_REPORT_NOTE_LENGTH,
);

type FieldError = LessonProblemReportField | null;

function isReportField(value: unknown): value is LessonProblemReportField {
  return value === 'reason' || value === 'note';
}

function fieldFromDetails(details: unknown): LessonProblemReportField | null {
  if (typeof details !== 'object' || details === null) {
    return null;
  }
  const field: unknown = Reflect.get(details, 'field');
  return isReportField(field) ? field : null;
}

function toServerError(status: number, code: string): string {
  if (status === 403 || status === 404) {
    return COPY.accessDenied;
  }
  if (status === 409 && code === API_ERROR_CODES.LESSON_CONTENT_CHANGED) {
    return COPY.contentChanged;
  }
  if (status === 429) {
    return COPY.rateLimited;
  }
  return COPY.knownFailure;
}

interface ReportLessonProblemDialogProps {
  planId: string;
  moduleId: string;
  taskId: string;
  lessonTitle: string;
  lessonContentUpdatedAt: string | null;
}

export function ReportLessonProblemDialog({
  planId,
  moduleId,
  taskId,
  lessonTitle,
  lessonContentUpdatedAt,
}: ReportLessonProblemDialogProps): ReactElement {
  const reasonName = useId();
  const legendId = useId();
  const reasonErrorId = useId();
  const noteId = useId();
  const noteHelpId = useId();
  const noteErrorId = useId();
  const serverErrorId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<LessonProblemReason | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<FieldError>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const firstReasonRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

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
    if (next) {
      setReason(null);
      setNote('');
      setFieldError(null);
      setServerError(null);
    }
    setOpen(next);
  }

  function focusField(field: LessonProblemReportField): void {
    if (field === 'reason') {
      firstReasonRef.current?.focus();
    } else {
      noteRef.current?.focus();
    }
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (submitting) {
      return;
    }
    if (reason === null) {
      flushSync(() => {
        setServerError(null);
        setFieldError('reason');
      });
      focusField('reason');
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setSubmitting(true);
    setFieldError(null);
    setServerError(null);

    const trimmedNote = note.trim();
    const settle = (): void => {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setSubmitting(false);
      }
    };
    const fail = (error: { field: LessonProblemReportField } | string) => {
      flushSync(() => {
        settle();
        if (typeof error === 'string') {
          setServerError(error);
        } else {
          setFieldError(error.field);
        }
      });
      if (typeof error === 'string') {
        submitRef.current?.focus();
      } else {
        focusField(error.field);
      }
    };

    try {
      const res = await fetch(
        `/api/v1/plans/${planId}/modules/${moduleId}/tasks/${taskId}/problem-report`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason,
            ...(trimmedNote !== '' && { note: trimmedNote }),
            lessonContentUpdatedAt,
          }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          ]),
        },
      );

      if (res.ok) {
        settle();
        toast.success(COPY.success);
        setOpen(false);
        return;
      }

      const parsed = await parseApiErrorResponse(res, COPY.knownFailure);
      const field =
        res.status === 400 ? fieldFromDetails(parsed.details) : null;
      fail(field ? { field } : toServerError(res.status, parsed.code));
    } catch (caught: unknown) {
      if (controller.signal.aborted) {
        settle();
        return;
      }
      clientLogger.error('Lesson problem report request failed', {
        planId,
        moduleId,
        taskId,
        error: caught,
      });
      fail(COPY.unknownOutcome);
    }
  }

  const reasonInvalid = fieldError === 'reason';
  const noteInvalid = fieldError === 'note';
  const noteDescribedBy = noteInvalid
    ? `${noteHelpId} ${noteErrorId}`
    : noteHelpId;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Trigger asChild>
        <Button variant='ghost'>
          <Flag aria-hidden='true' />
          Report a problem
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className='fixed inset-0 z-[51] bg-black/72 transition-opacity duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none motion-reduce:transition-none' />
        <DialogPrimitive.Content className='fixed top-[50%] left-[50%] z-[52] grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[32rem] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto overscroll-contain rounded-2xl border border-input bg-popover p-4 text-popover-foreground shadow-xl transition-opacity duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none motion-reduce:transition-none sm:p-6'>
          <div className='grid gap-2 pr-10'>
            <DialogPrimitive.Title className='type-card text-foreground'>
              Report a problem
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className='type-body text-muted-foreground'>
              Tell us what&apos;s wrong with “{lessonTitle}”. If you&apos;ve
              reported this lesson before, this report replaces your earlier
              one.
            </DialogPrimitive.Description>
          </div>

          <form
            className='grid gap-5'
            noValidate
            onSubmit={(event) => void handleSubmit(event)}
            aria-describedby={serverError ? serverErrorId : undefined}
          >
            <fieldset
              role='radiogroup'
              aria-labelledby={legendId}
              aria-required
              aria-invalid={reasonInvalid || undefined}
              disabled={submitting}
            >
              <legend id={legendId} className='mb-3 type-label text-foreground'>
                What&apos;s the problem?
              </legend>
              {reasonInvalid ? (
                <p id={reasonErrorId} className='mb-3 type-meta text-danger'>
                  Choose a reason.
                </p>
              ) : null}
              <div className='grid gap-2'>
                {LESSON_PROBLEM_REASONS.map((value, index) => (
                  <label
                    key={value}
                    className='flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-input px-3 py-3 transition-colors hover:border-muted-foreground has-checked:border-action-primary has-checked:bg-action-primary/12 has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background has-disabled:cursor-not-allowed has-disabled:opacity-60 motion-reduce:transition-none'
                  >
                    <input
                      ref={index === 0 ? firstReasonRef : undefined}
                      type='radio'
                      name={reasonName}
                      value={value}
                      required
                      checked={reason === value}
                      aria-describedby={
                        reasonInvalid ? reasonErrorId : undefined
                      }
                      className='mt-[2px] size-[20px] shrink-0 accent-action-primary outline-none'
                      onChange={() => {
                        setReason(value);
                        if (reasonInvalid) {
                          setFieldError(null);
                        }
                      }}
                    />
                    <span className='grid min-w-0 gap-1 type-meta text-muted-foreground'>
                      <span className='type-label text-foreground'>
                        {REASON_COPY[value].label}
                      </span>
                      {REASON_COPY[value].hint}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className='grid gap-2'>
              <Label htmlFor={noteId}>Details (optional)</Label>
              <Textarea
                ref={noteRef}
                id={noteId}
                value={note}
                maxLength={MAX_LESSON_PROBLEM_REPORT_NOTE_LENGTH}
                disabled={submitting}
                aria-invalid={noteInvalid || undefined}
                aria-describedby={noteDescribedBy}
                placeholder='For example: which sentence or step is wrong.'
                onChange={(event) => {
                  setNote(event.target.value);
                  if (noteInvalid) {
                    setFieldError(null);
                  }
                }}
              />
              <p
                id={noteHelpId}
                className='type-meta text-muted-foreground tabular-nums'
              >
                {numberFormat.format(note.length)}/{MAX_NOTE_LABEL} characters
              </p>
              {noteInvalid ? (
                <p id={noteErrorId} className='type-meta text-danger'>
                  Keep your details to {MAX_NOTE_LABEL} characters or fewer.
                </p>
              ) : null}
            </div>

            {serverError ? (
              <p
                id={serverErrorId}
                role='alert'
                className='rounded-lg border border-danger bg-danger-subtle px-3 py-2 type-body text-danger'
              >
                {serverError}
              </p>
            ) : null}

            <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
              <DialogPrimitive.Close asChild>
                <Button type='button' variant='outline' disabled={submitting}>
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <Button
                ref={submitRef}
                type='submit'
                aria-disabled={submitting || undefined}
                aria-busy={submitting || undefined}
              >
                {submitting ? (
                  <Loader2
                    aria-hidden='true'
                    className='animate-spin motion-reduce:animate-none'
                  />
                ) : null}
                Send report
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
