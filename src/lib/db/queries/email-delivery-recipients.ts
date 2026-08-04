import type { DbClient } from '@/lib/db/types';
import type { EmailNotificationCategory } from '@/shared/types/db.types';

import {
  userEmailNotificationPreferences,
  userEmailNotificationSettings,
  users,
} from '@supabase/schema';
import { and, gt, inArray, isNotNull, ne, sql } from 'drizzle-orm';

export type EmailDeliveryRecipient = {
  userId: string;
  email: string;
};

/**
 * Bounded cursor page of preference-eligible users with non-empty emails
 * for email workers. Filters unsubscribe-all and requested enabled categories
 * in SQL before applying the cursor and limit.
 */
export async function listEmailDeliveryRecipients(args: {
  batchSize: number;
  categories: readonly EmailNotificationCategory[];
  cursorUserId?: string | null;
  dbClient: Pick<DbClient, 'select'>;
}): Promise<{
  recipients: EmailDeliveryRecipient[];
  nextCursor: string | null;
}> {
  const batchSize = Math.max(1, Math.min(args.batchSize, 200));
  if (args.categories.length === 0) {
    return { recipients: [], nextCursor: null };
  }

  const notUnsubscribedAll = sql`NOT EXISTS (
    SELECT 1 FROM ${userEmailNotificationSettings}
    WHERE ${userEmailNotificationSettings.userId} = ${users.id}
    AND ${userEmailNotificationSettings.unsubscribeAllOptionalEmails} = true
  )`;

  const hasEnabledRequestedCategory = sql`EXISTS (
    SELECT 1 FROM ${userEmailNotificationPreferences}
    WHERE ${userEmailNotificationPreferences.userId} = ${users.id}
    AND ${inArray(userEmailNotificationPreferences.category, [
      ...args.categories,
    ])}
    AND ${userEmailNotificationPreferences.enabled} = true
  )`;

  const rows = await args.dbClient
    .select({
      userId: users.id,
      email: users.email,
    })
    .from(users)
    .where(
      and(
        isNotNull(users.email),
        ne(users.email, ''),
        notUnsubscribedAll,
        hasEnabledRequestedCategory,
        args.cursorUserId ? gt(users.id, args.cursorUserId) : sql`true`,
      ),
    )
    .orderBy(users.id)
    .limit(batchSize + 1);

  const page = rows.slice(0, batchSize);
  const nextCursor =
    rows.length > batchSize ? (page[page.length - 1]?.userId ?? null) : null;

  return {
    recipients: page.map((row) => ({
      userId: row.userId,
      email: row.email,
    })),
    nextCursor,
  };
}
