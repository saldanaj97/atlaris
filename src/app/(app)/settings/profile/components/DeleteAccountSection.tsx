'use client';

import { deleteAccountAction } from '@/app/(app)/settings/profile/actions';
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
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { clientLogger } from '@/lib/logging/client';
import { useReverification } from '@clerk/nextjs';
import { isReverificationCancelledError } from '@clerk/nextjs/errors';
import { type ReactElement, useState } from 'react';

const FAILURE_MESSAGES = {
  billing_cancel_failed:
    'We could not cancel your subscription, so your account was not deleted. Try again, or contact support.',
  unavailable: 'Account deletion is not available right now.',
  unknown:
    'We could not confirm whether your account was deleted. Reload the page before trying again.',
} as const;

export function DeleteAccountSection(): ReactElement {
  const deleteAccount = useReverification(deleteAccountAction);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDelete = async (): Promise<void> => {
    if (deleting) return;
    setDeleting(true);
    setErrorMessage(null);

    try {
      const result = await deleteAccount();
      if (result.status === 'deleted') {
        // Leave the app with a full load instead of signOut(). Clerk's signOut
        // refreshes this route first, and the session token stays valid for up
        // to a minute, so the refresh renders a deleted user and throws. The
        // user is already deleted in Clerk, so the next load is signed out.
        window.location.replace('/landing');
        return;
      }
      setErrorMessage(FAILURE_MESSAGES[result.status]);
    } catch (error: unknown) {
      if (!isReverificationCancelledError(error)) {
        clientLogger.error('Account deletion failed', { error });
        setErrorMessage(FAILURE_MESSAGES.unknown);
      }
    }
    setDeleting(false);
  };

  return (
    <Card as='section' className='gap-[24px] shadow-none'>
      <CardHeader>
        <CardTitle as='h3'>Delete account</CardTitle>
        <CardDescription>
          Permanently delete your account, your learning plans, and your
          progress.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog
          open={open}
          onOpenChange={(value) => {
            if (deleting) return;
            if (!value) setErrorMessage(null);
            setOpen(value);
          }}
        >
          <AlertDialogTrigger asChild>
            <Button variant='destructive'>Delete account</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className='space-y-2'>
                  <p>
                    This permanently deletes your account, learning plans,
                    progress, and settings. It cannot be undone.
                  </p>
                  <p>
                    A paid subscription ends immediately, with no further
                    charges and no refund for the current period.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            {errorMessage ? (
              <p
                role='alert'
                className='rounded-lg border border-danger bg-danger-subtle px-3 py-2 type-body text-danger'
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
                disabled={deleting}
                onClick={(event) => {
                  event.preventDefault();
                  void handleDelete();
                }}
              >
                {deleting ? 'Deleting…' : 'Delete account'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
