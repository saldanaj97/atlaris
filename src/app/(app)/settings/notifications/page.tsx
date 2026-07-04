import type { Metadata } from 'next';

import { NotificationPreferencesForm } from '@/app/(app)/settings/notifications/components/NotificationPreferencesForm';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ROUTES } from '@/features/navigation/routes';
import { requestBoundary } from '@/lib/api/request-boundary';
import {
  EMAIL_NOTIFICATION_CATEGORIES,
  getEmailNotificationPreferences,
} from '@/lib/db/queries/user-preferences';
import { emailNotificationPreferenceFormValuesFromPreferences } from '@/shared/notifications/email-preferences';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Notifications',
  description: 'Manage your notification preferences.',
};

export default async function NotificationsSettingsPage() {
  const preferences = await requestBoundary.component(({ actor, db }) =>
    getEmailNotificationPreferences(actor.id, db),
  );

  if (!preferences) {
    redirect(
      `${ROUTES.AUTH.SIGN_IN}?redirect_url=${encodeURIComponent(ROUTES.SETTINGS.NOTIFICATIONS)}`,
    );
  }

  return (
    <>
      <PageHeader
        title='Notifications'
        titleAs='h2'
        subtitle='Choose which optional product emails Atlaris can send.'
      />

      <Card>
        <CardHeader>
          <CardTitle as='h3'>Email Preferences</CardTitle>
          <CardDescription>
            Weekly summaries, daily reminders, and streak reminders are optional
            and stay off until you enable them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationPreferencesForm
            initialPreferences={emailNotificationPreferenceFormValuesFromPreferences(
              preferences,
            )}
            categories={[...EMAIL_NOTIFICATION_CATEGORIES]}
          />
        </CardContent>
      </Card>
    </>
  );
}
