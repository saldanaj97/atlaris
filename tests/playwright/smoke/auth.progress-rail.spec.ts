import { expect, renderedContrast, test } from './fixtures';

const RAIL_EDGE_MIN_CONTRAST = 3;
const ASYNC_SECTION_TIMEOUT_MS = 15_000;

// The fill and the remaining track are too close to tell apart, so the
// outline is what separates a progress rail from the card it sits on.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`progress rails are outlined in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/settings/usage');
    await expect(page.locator('html')).toHaveAttribute(
      'data-atlaris-theme',
      colorScheme,
    );

    const rail = page.getByRole('progressbar', { name: /^Active plans:/ });
    await expect(rail).toBeVisible({ timeout: ASYNC_SECTION_TIMEOUT_MS });
    expect(
      await rail.evaluate(renderedContrast, 'borderTopColor' as const),
    ).toBeGreaterThanOrEqual(RAIL_EDGE_MIN_CONTRAST);
  });
}
