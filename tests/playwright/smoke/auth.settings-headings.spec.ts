import { expect, expectHeading, test } from './fixtures';

test.describe.configure({ mode: 'serial' });

const LEDGER_SECTION_HEADINGS = [
  'Profile',
  'Plan & billing',
  'Usage',
  'AI model',
  'Integrations',
  'Notifications',
] as const;

const SETTINGS_SUBPAGES = [
  { path: '/settings/profile', section: 'Profile' },
  { path: '/settings/billing', section: 'Plan & billing' },
  { path: '/settings/ai', section: 'AI model' },
  { path: '/settings/integrations', section: 'Integrations' },
  { path: '/settings/notifications', section: 'Notifications' },
] as const;

const ASYNC_SECTION_TIMEOUT_MS = 15_000;

test('settings ledger exposes unified heading hierarchy', async ({ page }) => {
  for (const { path, section } of SETTINGS_SUBPAGES) {
    await test.step(`${path} headings`, async () => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expectHeading(page, 'Settings', 1);

      for (const heading of LEDGER_SECTION_HEADINGS) {
        await expectHeading(page, heading, 2);
      }

      await expectHeading(page, section, 2, ASYNC_SECTION_TIMEOUT_MS);
    });
  }
});
