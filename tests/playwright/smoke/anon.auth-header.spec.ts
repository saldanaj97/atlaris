import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures';

const headerCta = (page: Page, name: string): Locator =>
  page.getByRole('banner').getByRole('link', { name, exact: true });

/** Fill, label color and corner shape: what makes two buttons look alike. */
const buttonLook = (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      color: style.color,
      radius: style.borderRadius,
      border: style.borderColor,
    };
  });

// The sign-in page wears the marketing header, so its Sign up button is the
// same neutral fill as the landing header's call to action, not cantaloupe.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`the sign-in header matches the marketing header in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });

    await page.goto('/landing');
    const landingCta = await buttonLook(headerCta(page, 'Create a plan'));

    await page.goto('/auth/sign-in');
    await expect(
      page.getByRole('navigation', { name: 'Marketing navigation' }),
    ).toBeVisible();
    const signUp = headerCta(page, 'Sign up');
    await expect(signUp).toHaveAttribute('href', '/auth/sign-up');
    expect(await buttonLook(signUp)).toEqual(landingCta);
  });
}

// At phone width the menu button sits on the right with the landing shape.
test('the sign-in menu button matches landing at 390', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const menuButton = page
    .getByRole('banner')
    .getByRole('button', { name: 'Open menu' });
  const placement = () =>
    menuButton.evaluate((element) => ({
      right: Math.round(element.getBoundingClientRect().right),
      radius: getComputedStyle(element).borderRadius,
      border: getComputedStyle(element).borderStyle,
    }));

  await page.goto('/landing');
  const landing = await placement();

  await page.goto('/auth/sign-in');
  expect(await placement()).toEqual(landing);
});
