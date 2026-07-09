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

const ASYNC_SECTION_TIMEOUT_MS = 15_000;

test('settings ledger exposes unified heading hierarchy', async ({ page }) => {
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/settings$/);
  await expectHeading(page, 'Settings', 1);

  for (const heading of LEDGER_SECTION_HEADINGS) {
    await expectHeading(page, heading, 2, ASYNC_SECTION_TIMEOUT_MS);
  }
});
