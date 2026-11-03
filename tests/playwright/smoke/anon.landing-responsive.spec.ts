import { expect, test } from './fixtures';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

// The landing sections reflow without horizontal page scroll, and the three
// how-it-works steps stack on phones and sit in a row on desktop.
for (const colorScheme of ['light', 'dark'] as const) {
  for (const viewport of VIEWPORTS) {
    test(`landing reflows at ${viewport.width}px in ${colorScheme}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/landing');

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      const steps = page.locator(
        'section[aria-labelledby="landing-how-heading"] ol > li',
      );
      await expect(steps).toHaveCount(3);
      const boxes = await Promise.all(
        [0, 1, 2].map(async (index) => {
          const box = await steps.nth(index).boundingBox();
          expect(box).not.toBeNull();
          return box!;
        }),
      );

      const [first, second, third] = boxes;
      if (viewport.width < 768) {
        expect(second.y).toBeGreaterThan(first.y + first.height - 1);
        expect(third.y).toBeGreaterThan(second.y + second.height - 1);
        expect(second.x).toBeCloseTo(first.x, 0);
      } else {
        expect(second.x).toBeGreaterThan(first.x + first.width - 1);
        expect(third.x).toBeGreaterThan(second.x + second.width - 1);
        expect(second.y).toBeCloseTo(first.y, 0);
      }
    });
  }
}
