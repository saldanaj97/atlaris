'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { clientLogger } from '@/lib/logging/client';
import { useClerk } from '@clerk/nextjs';
import { useId, useState, type FormEvent, type ReactNode } from 'react';

const FINE_PRINT = 'One email when your invite is ready. No spam.';

type Status = 'idle' | 'submitting' | 'joined' | 'error';

function WaitlistFields({
  status,
  disabled,
  onSubmit,
  note,
}: {
  status: Status;
  disabled: boolean;
  onSubmit?: (email: string) => void;
  note: ReactNode;
}) {
  const inputId = useId();
  const errorId = useId();
  const submitting = status === 'submitting';
  const failed = status === 'error';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || submitting || !onSubmit) return;
    const email = new FormData(event.currentTarget).get('email');
    if (typeof email === 'string') onSubmit(email.trim());
  }

  return (
    <form className='mt-8 w-full max-w-md text-left' onSubmit={handleSubmit}>
      <Label htmlFor={inputId}>Email address</Label>
      <div className='mt-2 flex flex-col gap-3 sm:flex-row'>
        <Input
          id={inputId}
          name='email'
          type='email'
          autoComplete='email'
          placeholder='you@example.com'
          required
          disabled={disabled}
          aria-invalid={failed || undefined}
          aria-describedby={failed ? errorId : undefined}
        />
        <Button
          type='submit'
          className='min-h-11 shrink-0 px-6'
          disabled={disabled}
          aria-disabled={submitting || undefined}
        >
          {submitting ? 'Joining…' : 'Join the waitlist'}
        </Button>
      </div>
      {failed ? (
        <p id={errorId} role='alert' className='mt-2 text-sm text-danger'>
          We couldn’t add you right now. Check the address and try again.
        </p>
      ) : null}
      <p className='mt-3 text-xs text-muted-foreground'>{note}</p>
    </form>
  );
}

/** Clerk waitlist signup. Requires the Clerk sign-up mode to be set to Waitlist. */
export function WaitlistForm() {
  const clerk = useClerk();
  const [status, setStatus] = useState<Status>('idle');

  if (status === 'joined') {
    return (
      <output className='mt-8 block max-w-md rounded-[8px] border border-primary/35 bg-panel px-4 py-3 text-sm text-foreground'>
        You’re on the waitlist. We’ll email your invite when Atlaris opens.
      </output>
    );
  }

  async function join(emailAddress: string) {
    setStatus('submitting');
    try {
      await clerk.joinWaitlist({ emailAddress });
      setStatus('joined');
    } catch (error: unknown) {
      clientLogger.error('Failed to join Clerk waitlist', {
        context: 'launch-waitlist',
        message: error instanceof Error ? error.message : String(error),
      });
      setStatus('error');
    }
  }

  return (
    <WaitlistFields
      status={status}
      disabled={!clerk.loaded}
      onSubmit={(email) => void join(email)}
      note={FINE_PRINT}
    />
  );
}

/** Local environments without Clerk keys: same layout, signup disabled. */
export function WaitlistFormPreview() {
  return (
    <WaitlistFields
      status='idle'
      disabled
      note='Local preview — waitlist signup needs Clerk and is disabled.'
    />
  );
}
