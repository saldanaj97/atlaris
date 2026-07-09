import type { ReactElement } from 'react';

import { NotificationPreferencesForm } from '@/app/(app)/settings/notifications/components/NotificationPreferencesForm';
import { ROUTES } from '@/features/navigation/routes';
import { requestBoundary } from '@/lib/api/request-boundary';
import {
  EMAIL_NOTIFICATION_CATEGORIES,
  getEmailNotificationPreferences,
} from '@/lib/db/queries/user-preferences';
import { emailNotificationPreferenceFormValuesFromPreferences } from '@/shared/notifications/email-preferences';
import { redirect } from 'next/navigation';

export async function NotificationsSection(): Promise<ReactElement> {
  const preferences = await requestBoundary.component(({ actor, db }) =>
    getEmailNotificationPreferences(actor.id, db),
  );

  if (!preferences) {
    redirect(
      `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(`${ROUTES.SETTINGS.ROOT}#notifications`)}`,
    );
  }

  return (
    <NotificationPreferencesForm
      initialPreferences={emailNotificationPreferenceFormValuesFromPreferences(
        preferences,
      )}
      categories={[...EMAIL_NOTIFICATION_CATEGORIES]}
    />
  );
}
