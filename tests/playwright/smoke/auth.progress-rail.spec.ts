import { expect, test } from './fixtures';

const RAIL_EDGE_MIN_CONTRAST = 3;
const ASYNC_SECTION_TIMEOUT_MS = 15_000;

/**
 * WCAG contrast between a progress rail's outline and its track. The fill and
 * the remaining track are too close to tell apart, so the outline is what
 * separates the rail from the card it sits on.
 */
function railEdgeContrast(element: Element): number {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) throw new Error('2D canvas unavailable');
  const toRgb = (color: string) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
  };
  const luminance = (color: string) => {
    const [r, g, b] = toRgb(color).map((value) => {
      const channel = value / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const style = getComputedStyle(element);
  if (Number.parseFloat(style.borderTopWidth) <= 0) return 1;
  const [lighter, darker] = [
    luminance(style.borderTopColor),
    luminance(style.backgroundColor),
  ].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

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
    expect(await rail.evaluate(railEdgeContrast)).toBeGreaterThanOrEqual(
      RAIL_EDGE_MIN_CONTRAST,
    );
  });
}
