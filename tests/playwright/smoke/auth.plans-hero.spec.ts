import { expect, test } from './fixtures';

// The plan library's title is one solid color: no part of it is painted with
// a gradient or a different text color.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`plans title is a single color in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/plans');
    await expect(page.locator('html')).toHaveAttribute(
      'data-atlaris-theme',
      colorScheme,
    );

    const title = page.getByRole('heading', { level: 1, name: 'Your plans' });
    await expect(title).toBeVisible();

    const paint = await title.evaluate((heading) =>
      [heading, ...heading.querySelectorAll('*')].map((node) => {
        const style = getComputedStyle(node);
        return {
          color: style.color,
          clip: style.backgroundClip,
          image: style.backgroundImage,
        };
      }),
    );
    expect(new Set(paint.map(({ color }) => color)).size).toBe(1);
    expect(paint.every(({ clip }) => clip !== 'text')).toBe(true);
    expect(paint.every(({ image }) => image === 'none')).toBe(true);
  });
}
