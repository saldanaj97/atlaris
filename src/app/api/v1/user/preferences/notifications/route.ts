import { updateEmailNotificationPreferencesSchema } from '@/app/api/v1/user/preferences/notifications/validation';
import { AppError, ValidationError } from '@/lib/api/errors';
import { parseJsonBody } from '@/lib/api/parse-json-body';
import { requestBoundary } from '@/lib/api/request-boundary';
import { json } from '@/lib/api/response';
import { saveEmailNotificationPreferences } from '@/lib/db/queries/user-preferences';
import {
  emailNotificationPreferenceFormValuesFromPreferences,
  emailNotificationPreferencesFromFormValues,
} from '@/shared/notifications/email-preferences';

export const PATCH = requestBoundary.route(
  { rateLimit: 'mutation' },
  async ({ req, actor, db }) => {
    const body = await parseJsonBody(req, {
      mode: 'required',
      onMalformedJson: () =>
        new ValidationError('Invalid JSON in request body'),
    });
    const parsed = updateEmailNotificationPreferencesSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.flatten();
      throw new ValidationError('Invalid notification preferences', errors, {
        errors,
      });
    }

    const savedPreferences = await saveEmailNotificationPreferences(
      actor.id,
      emailNotificationPreferencesFromFormValues(parsed.data),
      db,
    );

    if (!savedPreferences) {
      throw new AppError('Failed to persist notification preferences.', {
        status: 500,
        code: 'NOTIFICATION_PREFERENCES_UPDATE_FAILED',
        logMeta: { userId: actor.id },
      });
    }

    return json({
      message: 'Notification preferences updated',
      preferences:
        emailNotificationPreferenceFormValuesFromPreferences(savedPreferences),
    });
  },
);
