'use server';

import type { AccountDeletionResult } from '@/features/auth/account-deletion';

import { deleteAccount } from '@/features/auth/account-deletion';
import { requestBoundary } from '@/lib/api/request-boundary';
import { localProductTestingEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';
import {
  auth,
  clerkClient as getClerkClient,
  reverificationError,
} from '@clerk/nextjs/server';

export type DeleteAccountActionResult =
  | AccountDeletionResult
  | { status: 'unavailable' };

/**
 * Cancels paid billing, deletes the Clerk user, and erases local data. Clerk
 * must have re-verified the session in the last 10 minutes; the client's
 * useReverification hook handles the returned hint.
 */
export async function deleteAccountAction() {
  if (localProductTestingEnv.enabled) {
    return { status: 'unavailable' } satisfies DeleteAccountActionResult;
  }

  const { has, userId } = await auth();
  if (!userId) {
    return { status: 'unavailable' } satisfies DeleteAccountActionResult;
  }
  if (!has({ reverification: 'strict' })) {
    return reverificationError('strict');
  }

  const result = await requestBoundary.action(
    { rateLimit: 'mutation' },
    async ({ actor }): Promise<DeleteAccountActionResult> => {
      // A DEV_AUTH_USER_ID override must never delete the real session user.
      if (actor.authUserId !== userId) {
        return { status: 'unavailable' };
      }

      return deleteAccount({
        authUserId: actor.authUserId,
        clerkClient: await getClerkClient(),
        logger,
      });
    },
  );

  return (
    result ?? ({ status: 'unavailable' } satisfies DeleteAccountActionResult)
  );
}
