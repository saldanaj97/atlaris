import type { DbClient } from '@/lib/db/types';

import { users } from '@supabase/schema';
import { and, gt, isNotNull, ne, sql } from 'drizzle-orm';

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
  dbClient: Pick<DbClient, 'select'>;
}): Promise<{
  recipients: EmailDeliveryRecipient[];
  nextCursor: string | null;
}> {
  const batchSize = Math.max(1, Math.min(args.batchSize, 200));
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
