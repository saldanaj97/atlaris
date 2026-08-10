'use server';

import { updateUserProfileSchema } from '@/app/api/v1/user/profile/validation';
import { requestBoundary } from '@/lib/api/request-boundary';
import { upsertUserAnalyticsTimezone } from '@/lib/db/queries/user-preferences';

export async function syncAnalyticsTimezoneAction(
  analyticsTimezone: string,
): Promise<boolean> {
  const parsed = updateUserProfileSchema.safeParse({ analyticsTimezone });
  if (!parsed.success) return false;

  const nextAnalyticsTimezone = parsed.data.analyticsTimezone;
  if (!nextAnalyticsTimezone) return false;

  const result = await requestBoundary.action(async ({ actor, db }) => {
    if (actor.analyticsTimezone === nextAnalyticsTimezone) {
      return false;
    }

    await upsertUserAnalyticsTimezone(actor.id, nextAnalyticsTimezone, db);

    return true;
  });

  return result ?? false;
}
