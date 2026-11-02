import { expect, test } from './fixtures';

// The landing hero, its example cards and the header follow the page theme:
// nothing on the page may force its own light or dark scope.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`landing hero follows the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/landing');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-atlaris-theme', colorScheme);
    await expect(page.locator('body [data-atlaris-theme]')).toHaveCount(0);
    await expect(page.locator('body .dark')).toHaveCount(0);

    const hero = page.locator(
      'section[aria-labelledby="landing-hero-heading"]',
    );
    const [heroBackground, pageBackground] = await Promise.all([
      hero.evaluate((node) => getComputedStyle(node).backgroundColor),
      page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    ]);
    expect(heroBackground).toBe(pageBackground);
  });
}
