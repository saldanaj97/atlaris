'use server';

import { updateUserProfileSchema } from '@/app/api/v1/user/profile/validation';
import { requestBoundary } from '@/lib/api/request-boundary';
import { users } from '@supabase/schema';
import { eq, sql } from 'drizzle-orm';

export async function syncAnalyticsTimezoneAction(
  analyticsTimezone: string,
): Promise<boolean> {
  const parsed = updateUserProfileSchema.safeParse({ analyticsTimezone });
  if (!parsed.success) return false;

  const result = await requestBoundary.action(async ({ actor, db }) => {
    if (actor.analyticsTimezone === parsed.data.analyticsTimezone) {
      return false;
    }

    await db
      .update(users)
      .set({
        analyticsTimezone: parsed.data.analyticsTimezone,
        updatedAt: sql<Date>`now()`,
      })
      .where(eq(users.authUserId, actor.authUserId));

    return true;
  });

  return result ?? false;
}
