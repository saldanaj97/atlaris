import { expect, renderedTextContrast, test } from './fixtures';

// The analytics week-over-week arrow for a falling metric is red in both
// themes and holds 4.5:1 on a panel. Seeded smoke accounts have no activity
// to fall, so this checks the token on a panel probe.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`the falling-metric red holds 4.5:1 on a panel in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/pricing');

    const probe = await page.evaluateHandle(() => {
      const panel = document.createElement('div');
      panel.className = 'bg-panel';
      const arrow = document.createElement('span');
      arrow.className = 'text-trend-down';
      arrow.textContent = 'down';
      panel.append(arrow);
      document.body.append(panel);
      return arrow;
    });
    expect(await probe.evaluate(renderedTextContrast)).toBeGreaterThanOrEqual(
      4.5,
    );
    // Red, not orange or the salmon rose: green stays far below red, which
    // cantaloupe (#FC734D) and rose-400 (#FF8C94) both fail.
    const color = await probe.evaluate(
      (element) => getComputedStyle(element).color,
    );
    const [r, g, b] = (color.match(/\d+/g) ?? []).map(Number);
    expect(r).toBeGreaterThan(g * 2.5);
    expect(r).toBeGreaterThan(b * 1.4);
  });
}
