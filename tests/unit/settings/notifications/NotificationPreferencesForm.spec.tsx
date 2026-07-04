import type { EmailNotificationPreferenceFormValues } from '@/shared/notifications/email-preferences';
import type { EmailNotificationCategory } from '@/shared/types/db.types';

import { NotificationPreferencesForm } from '@/app/(app)/settings/notifications/components/NotificationPreferencesForm';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../../mocks/unit/sonner.unit';

const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const CATEGORIES: EmailNotificationCategory[] = [
  'weekly_summary',
  'daily_reminder',
  'streak_reminder',
];

const DEFAULT_PREFERENCES: EmailNotificationPreferenceFormValues = {
  unsubscribeAllOptionalEmails: false,
  weeklySummary: false,
  dailyReminder: false,
  streakReminder: false,
};

function mockJsonResponse(
  body: unknown,
  options?: { ok?: boolean; status?: number },
) {
  return {
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

function renderForm(
  initialPreferences: EmailNotificationPreferenceFormValues = DEFAULT_PREFERENCES,
) {
  return render(
    <NotificationPreferencesForm
      initialPreferences={initialPreferences}
      categories={CATEGORIES}
    />,
  );
}

describe('NotificationPreferencesForm', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    refreshMock.mockClear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders default-off preferences with save disabled', () => {
    renderForm();

    expect(
      screen.getByRole('switch', { name: /weekly summary emails/i }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(
      screen.getByRole('switch', { name: /daily reminder emails/i }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(
      screen.getByRole('switch', { name: /streak reminder emails/i }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(
      screen.getByRole('button', { name: /save preferences/i }),
    ).toBeDisabled();
  });

  it('saves changed category preferences', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        message: 'Notification preferences updated',
        preferences: {
          ...DEFAULT_PREFERENCES,
          weeklySummary: true,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderForm();

    await user.click(
      screen.getByRole('switch', { name: /weekly summary emails/i }),
    );
    await user.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Notification preferences saved',
      );
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/user/preferences/notifications',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...DEFAULT_PREFERENCES,
          weeklySummary: true,
        }),
      }),
    );
    expect(refreshMock).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('button', { name: /save preferences/i }),
    ).toBeDisabled();
  });

  it('unsubscribe-all disables category switches without clearing their values', async () => {
    const initialPreferences = {
      ...DEFAULT_PREFERENCES,
      weeklySummary: true,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        message: 'Notification preferences updated',
        preferences: {
          ...initialPreferences,
          unsubscribeAllOptionalEmails: true,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderForm(initialPreferences);

    await user.click(
      screen.getByRole('switch', {
        name: /unsubscribe from optional emails/i,
      }),
    );

    const weeklySwitch = screen.getByRole('switch', {
      name: /weekly summary emails/i,
    });
    expect(weeklySwitch).toBeDisabled();
    expect(weeklySwitch).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      ...initialPreferences,
      unsubscribeAllOptionalEmails: true,
    });
  });

  it('keeps local changes and shows an error when save fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse(
          {
            error: 'Nope',
            code: 'BAD_REQUEST',
          },
          { ok: false, status: 400 },
        ),
      ),
    );

    renderForm();

    await user.click(
      screen.getByRole('switch', { name: /daily reminder emails/i }),
    );
    await user.click(screen.getByRole('button', { name: /save preferences/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Nope');
    });
    expect(
      screen.getByRole('switch', { name: /daily reminder emails/i }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('button', { name: /save preferences/i }),
    ).toBeEnabled();
  });
});
