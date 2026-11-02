import { expect, expectHeading, test } from './fixtures';

test.describe.configure({ mode: 'serial' });

const SETTINGS_ROUTES = [
  { path: '/settings/profile', heading: 'Profile' },
  { path: '/settings/billing', heading: 'Billing' },
  { path: '/settings/usage', heading: 'Usage' },
  { path: '/settings/ai', heading: 'AI model' },
  { path: '/settings/notifications', heading: 'Notifications' },
] as const;

const ASYNC_SECTION_TIMEOUT_MS = 15_000;

test('settings root redirects to the profile section', async ({ page }) => {
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expectHeading(page, 'Settings', 1);
  await expectHeading(page, 'Profile', 2, ASYNC_SECTION_TIMEOUT_MS);
  await expect(
    page.getByRole('heading', { name: 'Billing', exact: true }),
  ).toHaveCount(0);
});

test('billing names its section once', async ({ page }) => {
  await page.goto('/settings/billing');
  await expectHeading(page, 'Billing', 2, ASYNC_SECTION_TIMEOUT_MS);

  // The layout's "Billing" heading names the page; the section is a labelled
  // region, not a second heading one level down.
  await expect(
    page.getByRole('main').getByRole('heading', { level: 2 }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'Plan & billing' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Plan & billing' }),
  ).toBeVisible();
});

test('each settings route exposes only its section heading', async ({
  page,
}) => {
  for (const section of SETTINGS_ROUTES) {
    await page.goto(section.path);
    await expect(page).toHaveURL(new RegExp(`${section.path}$`));
    await expectHeading(page, section.heading, 2, ASYNC_SECTION_TIMEOUT_MS);

    for (const other of SETTINGS_ROUTES) {
      if (other.heading === section.heading) continue;
      await expect(
        page.getByRole('heading', { name: other.heading, exact: true }),
      ).toHaveCount(0);
    }
  }
});
