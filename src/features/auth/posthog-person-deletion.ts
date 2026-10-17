import type { DbClient } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';

import { isPostHogEnabledInCurrentEnvironment } from '@/lib/config/env/posthog';
import {
  createServerEnvAccess,
  getProcessEnvSource,
} from '@/lib/config/env/shared';
import {
  deletePostHogPersons,
  POSTHOG_BULK_DELETE_LIMIT,
} from '@/lib/posthog/delete-person';
import { users } from '@supabase/schema';
import { db as serviceRoleDb } from '@supabase/service-role';
import { and, inArray, isNotNull, isNull } from 'drizzle-orm';

const access = createServerEnvAccess(getProcessEnvSource);

type DeletionLogger = Pick<Logger, 'error' | 'info'>;

async function markPostHogPersonsDeleted(
  db: DbClient,
  authUserIds: string[],
  now: Date,
): Promise<void> {
  await db
    .update(users)
    .set({ posthogDeletedAt: now })
    .where(inArray(users.authUserId, authUserIds));
}

/**
 * Deletes a just-deleted user's PostHog person and marks the row when PostHog
 * accepts it. Never throws: the account is already gone, and the jobs Worker
 * retries unmarked rows daily (`retryPostHogPersonDeletions`).
 */
export async function deletePostHogPersonForDeletedUser(
  authUserId: string,
  {
    db = serviceRoleDb,
    logger,
    now = new Date(),
  }: { db?: DbClient; logger: DeletionLogger; now?: Date },
): Promise<void> {
  if (!isPostHogEnabledInCurrentEnvironment()) return;

  const apiKey = access.getServerOptional('POSTHOG_PERSONAL_API_KEY');
  if (!apiKey) {
    logger.error(
      { authUserId },
      'POSTHOG_PERSONAL_API_KEY is not set; PostHog person not deleted',
    );
    return;
  }

  if (await deletePostHogPersons([authUserId], { apiKey, logger })) {
    await markPostHogPersonsDeleted(db, [authUserId], now).catch((error) =>
      logger.error(
        { authUserId, error },
        'PostHog person deleted but not marked; the daily retry repeats it',
      ),
    );
  }
}

/**
 * Deletes the PostHog persons of tombstoned users whose deletion PostHog has
 * not accepted yet, up to one bulk request per run. Throws when PostHog
 * rejects the request so the caller reports it.
 */
export async function retryPostHogPersonDeletions({
  apiKey,
  db,
  logger,
  now = new Date(),
}: {
  apiKey: string;
  db: DbClient;
  logger: DeletionLogger;
  now?: Date;
}): Promise<{ deleted: number }> {
  const pending = await db
    .select({ authUserId: users.authUserId })
    .from(users)
    .where(and(isNotNull(users.clerkDeletedAt), isNull(users.posthogDeletedAt)))
    .limit(POSTHOG_BULK_DELETE_LIMIT);
  if (pending.length === 0) return { deleted: 0 };

  const authUserIds = pending.map((row) => row.authUserId);
  if (!(await deletePostHogPersons(authUserIds, { apiKey, logger }))) {
    throw new Error('PostHog person deletion failed');
  }
  await markPostHogPersonsDeleted(db, authUserIds, now);
  return { deleted: authUserIds.length };
}
