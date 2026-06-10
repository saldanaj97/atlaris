import { expect, expectHeading, test } from './fixtures';

test.describe.configure({ mode: 'serial' });

const SETTINGS_SUBPAGES = [
  { path: '/settings/profile', h2: 'Profile' },
  { path: '/settings/billing', h2: 'Billing' },
  { path: '/settings/ai', h2: 'AI Preferences' },
  { path: '/settings/integrations', h2: 'Integrations' },
  { path: '/settings/notifications', h2: 'Notifications' },
] as const;

const BILLING_CONTENT_TIMEOUT_MS = 15_000;

test('settings subpages expose consistent heading hierarchy', async ({
  page,
}) => {
  for (const { path, h2 } of SETTINGS_SUBPAGES) {
    await test.step(`${path} headings`, async () => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expectHeading(page, 'Settings', 1);
      await expectHeading(page, h2, 2);

      if (path === '/settings/billing') {
        await expectHeading(
          page,
          'Current Plan',
          3,
          BILLING_CONTENT_TIMEOUT_MS,
        );
        await expectHeading(page, 'Usage', 3, BILLING_CONTENT_TIMEOUT_MS);
      }

      if (path === '/settings/ai') {
        await expectHeading(
          page,
          'Model Selection',
          3,
          BILLING_CONTENT_TIMEOUT_MS,
        );
        await expectHeading(page, 'About AI Models', 3);
      }
    });
  }
});
