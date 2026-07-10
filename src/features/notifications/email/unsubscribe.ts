import type { DbClient } from '@/lib/db/types';

import { verifyUnsubscribeToken } from './unsubscribe-token';
import { emailEnv } from '@/lib/config/env/email';
import { users, userEmailNotificationSettings } from '@supabase/schema';
import { db as serviceRoleDb } from '@supabase/service-role';
import { eq, sql } from 'drizzle-orm';

export type UnsubscribeResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_token' | 'user_not_found' };

/**
 * One-click / signed-link unsubscribe. Always reveals no account state to callers
 * beyond success redirect vs generic failure; invalid tokens look like unknown users.
 */
export async function applySignedEmailUnsubscribe(args: {
  token: string;
  secret?: string;
  db?: Pick<DbClient, 'select' | 'insert'>;
  nowMs?: number;
}): Promise<UnsubscribeResult> {
  const secret = args.secret ?? emailEnv.unsubscribeTokenSecret;
  if (!secret) {
    return { ok: false, reason: 'invalid_token' };
  }

  const payload = verifyUnsubscribeToken({
    token: args.token,
    secret,
    nowMs: args.nowMs,
  });
  if (!payload) {
    return { ok: false, reason: 'invalid_token' };
  }

  const db = args.db ?? serviceRoleDb;
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, payload.userId));

  if (!user) {
    return { ok: false, reason: 'user_not_found' };
  }

  await db
    .insert(userEmailNotificationSettings)
    .values({
      userId: user.id,
      unsubscribeAllOptionalEmails: true,
      updatedAt: sql<Date>`now()`,
    })
    .onConflictDoUpdate({
      target: userEmailNotificationSettings.userId,
      set: {
        unsubscribeAllOptionalEmails: true,
        updatedAt: sql<Date>`now()`,
      },
    });

  return { ok: true };
}
