import type { DbClient } from '@/lib/db/types';
import type { EmailNotificationCategory } from '@/shared/types/db.types';

import {
  userEmailNotificationPreferences,
  userEmailNotificationSettings,
  users,
} from '@supabase/schema';
import { and, eq, gt, isNotNull, isNull, ne, sql } from 'drizzle-orm';

export type EmailDeliveryRecipient = {
  userId: string;
  email: string;
};

/**
 * Bounded cursor page of users with non-empty emails for email workers.
 */
export async function listEmailDeliveryRecipients(args: {
  batchSize: number;
  cursorUserId?: string | null;
  categories: readonly EmailNotificationCategory[];
  dbClient: Pick<DbClient, 'select'>;
}): Promise<{
  recipients: EmailDeliveryRecipient[];
  nextCursor: string | null;
}> {
  const batchSize = Math.max(1, Math.min(args.batchSize, 200));
  const categoryFilter =
    args.categories.length === 0
      ? sql`false`
      : sql`exists (
          select 1
          from ${userEmailNotificationPreferences}
          where ${userEmailNotificationPreferences.userId} = ${users.id}
            and ${eq(userEmailNotificationPreferences.enabled, true)}
            and ${userEmailNotificationPreferences.category} in (${sql.join(
              args.categories.map(
                (category) => sql`${category}::email_notification_category`,
              ),
              sql`, `,
            )})
        )`;
  const unsubscribeFilter = sql`not exists (
    select 1
    from ${userEmailNotificationSettings}
    where ${userEmailNotificationSettings.userId} = ${users.id}
      and ${eq(
        userEmailNotificationSettings.unsubscribeAllOptionalEmails,
        true,
      )}
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
        isNull(users.clerkDeletedAt),
        categoryFilter,
        unsubscribeFilter,
        args.cursorUserId ? gt(users.id, args.cursorUserId) : sql`true`,
      ),
    )
    .orderBy(users.id)
    .limit(batchSize + 1);

  const page = rows.slice(0, batchSize);
  const nextCursor =
    rows.length > batchSize ? (page[page.length - 1]?.userId ?? null) : null;

  return {
    recipients: page.flatMap((row) => {
      if (row.email === null) {
        return [];
      }

      return [
        {
          userId: row.userId,
          email: row.email,
        },
      ];
    }),
    nextCursor,
  };
}

/**
 * Fences a scheduled send against the current local delivery identity.
 */
export async function isEmailDeliveryRecipientCurrent(args: {
  userId: string;
  email: string;
  dbClient: Pick<DbClient, 'select'>;
}): Promise<boolean> {
  const rows = await args.dbClient
    .select({ userId: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, args.userId),
        eq(users.email, args.email),
        isNotNull(users.email),
        ne(users.email, ''),
        isNull(users.clerkDeletedAt),
      ),
    )
    .limit(1);

  return rows.length > 0;
}
