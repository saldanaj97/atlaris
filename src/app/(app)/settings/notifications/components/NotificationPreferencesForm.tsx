'use client';

import type { EmailNotificationPreferenceFormValues } from '@/shared/notifications/email-preferences';
import type { EmailNotificationCategory } from '@/shared/types/db.types';

import { requestJson } from '@/app/_shared/client-api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  emailNotificationPreferenceFormValuesSchema,
  getEmailNotificationCategoryCopy,
} from '@/shared/notifications/email-preferences';
import { CheckCircle2, MailWarning } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

const notificationPreferencesResponseSchema = z.object({
  message: z.string(),
  preferences: emailNotificationPreferenceFormValuesSchema,
});

type NotificationPreferencesResponse = z.infer<
  typeof notificationPreferencesResponseSchema
>;

type NotificationPreferencesFormProps = {
  initialPreferences: EmailNotificationPreferenceFormValues;
  categories: EmailNotificationCategory[];
};

function isDirty(
  current: EmailNotificationPreferenceFormValues,
  saved: EmailNotificationPreferenceFormValues,
): boolean {
  return (
    current.unsubscribeAllOptionalEmails !==
      saved.unsubscribeAllOptionalEmails ||
    current.weeklySummary !== saved.weeklySummary ||
    current.dailyReminder !== saved.dailyReminder ||
    current.streakReminder !== saved.streakReminder
  );
}

function fieldForCategory(
  category: EmailNotificationCategory,
): keyof Omit<
  EmailNotificationPreferenceFormValues,
  'unsubscribeAllOptionalEmails'
> {
  switch (category) {
    case 'weekly_summary':
      return 'weeklySummary';
    case 'daily_reminder':
      return 'dailyReminder';
    case 'streak_reminder':
      return 'streakReminder';
    default: {
      const _exhaustiveCheck: never = category;
      return _exhaustiveCheck;
    }
  }
}

export function NotificationPreferencesForm({
  initialPreferences,
  categories,
}: NotificationPreferencesFormProps) {
  const router = useRouter();
  const idPrefix = useId();
  const [savedPreferences, setSavedPreferences] = useState(initialPreferences);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [isSaving, setIsSaving] = useState(false);
  const hasChanges = isDirty(preferences, savedPreferences);
  const unsubscribeOverrideActive = preferences.unsubscribeAllOptionalEmails;
  const categoriesDisabled = unsubscribeOverrideActive || isSaving;

  function updateField(
    field: keyof EmailNotificationPreferenceFormValues,
    checked: boolean,
  ): void {
    setPreferences((current) => ({ ...current, [field]: checked }));
  }

  async function handleSave(): Promise<void> {
    if (!hasChanges || isSaving) return;

    setIsSaving(true);
    const result = await requestJson<NotificationPreferencesResponse>({
      url: '/api/v1/user/preferences/notifications',
      init: {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      },
      schema: notificationPreferencesResponseSchema,
      fallbackMessage: 'Failed to save notification preferences',
    });
    setIsSaving(false);

    if (result.kind === 'success') {
      setSavedPreferences(result.data.preferences);
      setPreferences(result.data.preferences);
      toast.success('Notification preferences saved');
      router.refresh();
      return;
    }

    if (result.kind === 'error') {
      toast.error(result.message);
    }
  }

  return (
    <div className='space-y-6'>
      <section
        aria-labelledby={`${idPrefix}-unsubscribe-label`}
        className='rounded-lg border border-border bg-card p-5'
      >
        <div className='flex items-start justify-between gap-4'>
          <div className='space-y-2'>
            <div className='flex items-center gap-2'>
              <MailWarning
                aria-hidden
                className='size-4 text-muted-foreground'
              />
              <Label
                id={`${idPrefix}-unsubscribe-label`}
                htmlFor={`${idPrefix}-unsubscribe`}
                className='text-base font-semibold'
              >
                Unsubscribe from optional emails
              </Label>
            </div>
            <p className='text-sm text-muted-foreground'>
              This overrides the category choices below without changing them.
              Account, security, and billing emails still send when required.
            </p>
          </div>
          <Switch
            id={`${idPrefix}-unsubscribe`}
            checked={preferences.unsubscribeAllOptionalEmails}
            disabled={isSaving}
            onCheckedChange={(checked) =>
              updateField('unsubscribeAllOptionalEmails', checked)
            }
            aria-labelledby={`${idPrefix}-unsubscribe-label`}
            aria-describedby={`${idPrefix}-unsubscribe-help`}
          />
        </div>
        <p id={`${idPrefix}-unsubscribe-help`} className='sr-only'>
          When enabled, all optional email categories are disabled.
        </p>
      </section>

      <div className='grid gap-4'>
        {categories.map((category) => {
          const field = fieldForCategory(category);
          const copy = getEmailNotificationCategoryCopy(category);
          const inputId = `${idPrefix}-${category}`;
          const descriptionId = `${inputId}-description`;

          return (
            <section
              key={category}
              aria-labelledby={`${inputId}-label`}
              className='rounded-lg border border-border bg-card p-5'
            >
              <div className='flex items-start justify-between gap-4'>
                <div className='space-y-2'>
                  <Label
                    id={`${inputId}-label`}
                    htmlFor={inputId}
                    className='text-base font-semibold'
                  >
                    {copy.label}
                  </Label>
                  <p
                    id={descriptionId}
                    className='text-sm text-muted-foreground'
                  >
                    {copy.description}
                  </p>
                  {unsubscribeOverrideActive && (
                    <p className='text-xs text-muted-foreground'>
                      Unsubscribe-all is currently overriding this preference.
                    </p>
                  )}
                </div>
                <Switch
                  id={inputId}
                  checked={preferences[field]}
                  disabled={categoriesDisabled}
                  onCheckedChange={(checked) => updateField(field, checked)}
                  aria-labelledby={`${inputId}-label`}
                  aria-describedby={descriptionId}
                />
              </div>
            </section>
          );
        })}
      </div>

      <div className='flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <CheckCircle2 aria-hidden className='size-4' />
          Optional emails are off until you enable them.
        </div>
        <Button
          type='button'
          disabled={!hasChanges || isSaving}
          onClick={() => void handleSave()}
        >
          {isSaving ? 'Saving...' : 'Save Preferences'}
        </Button>
      </div>
    </div>
  );
}
