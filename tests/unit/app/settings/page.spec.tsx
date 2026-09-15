import {
  resolveSettingsEntryRedirect,
  runSettingsEntryRedirect,
} from '@/app/(app)/settings/settings-entry-redirect';
import { ROUTES } from '@/features/navigation/routes';
import { redirect } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('settings entry redirect', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends /settings to the profile section', () => {
    expect(resolveSettingsEntryRedirect()).toBe(ROUTES.SETTINGS.PROFILE);

    runSettingsEntryRedirect();

    expect(vi.mocked(redirect)).toHaveBeenCalledWith(ROUTES.SETTINGS.PROFILE);
  });

  it('sends checkout returns to billing with query markers', () => {
    expect(
      resolveSettingsEntryRedirect({
        checkout: '1',
        checkoutBaseline: 'free|active||0',
      }),
    ).toBe(
      `${ROUTES.SETTINGS.BILLING}?checkout=1&checkoutBaseline=free%7Cactive%7C%7C0`,
    );
  });

  it('keeps the Clerk user-profile catch-all on the same entry redirect', async () => {
    const { default: SettingsUserProfilePage } =
      await import('@/app/(app)/settings/[...user-profile]/page');

    await SettingsUserProfilePage({
      searchParams: Promise.resolve({}),
    });

    expect(vi.mocked(redirect)).toHaveBeenCalledWith(ROUTES.SETTINGS.PROFILE);
  });

  it('keeps checkout query on Clerk catch-all returns', async () => {
    const { default: SettingsUserProfilePage } =
      await import('@/app/(app)/settings/[...user-profile]/page');

    await SettingsUserProfilePage({
      searchParams: Promise.resolve({
        checkout: '1',
        checkoutBaseline: 'free|active||0',
      }),
    });

    expect(vi.mocked(redirect)).toHaveBeenCalledWith(
      `${ROUTES.SETTINGS.BILLING}?checkout=1&checkoutBaseline=free%7Cactive%7C%7C0`,
    );
  });
});
