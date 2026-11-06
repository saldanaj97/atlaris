import type { Locator } from '@playwright/test';

import { expect, renderedContrast, test } from './fixtures';

// Pricing cards state plan length in weeks, the same as the comparison table,
// whatever copy the billing provider holds.
test('pricing states every plan length in weeks', async ({ page }) => {
  await page.goto('/pricing');

  const pro = page.getByRole('article', { name: 'Pro' });
  await expect(pro.getByText('Plans up to 24 weeks')).toBeVisible();
  await expect(
    page
      .getByRole('article', { name: 'Starter' })
      .getByText('Plans up to 8 weeks'),
  ).toBeVisible();
  await expect(page.getByText(/unlimited plan duration/i)).toHaveCount(0);
  const longestPlan = page
    .getByRole('region', { name: 'Plan comparison' })
    .getByRole('row', { name: /Longest plan/ });
  await expect(longestPlan).toContainText('24 weeks');
  await expect(longestPlan).not.toContainText(/months?/);
});

// Pricing and the landing sections share one column, so the left edge doesn't
// jump between pages.
for (const width of [390, 1280, 1920]) {
  test(`pricing starts on the landing column at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const leftEdge = (locator: Locator) =>
      locator.evaluate((element) => element.getBoundingClientRect().left);

    await page.goto('/');
    const landing = await leftEdge(
      page.getByRole('heading', { name: 'Pay only when you need more room' }),
    );

    await page.goto('/pricing');
    for (const locator of [
      page.getByRole('heading', { name: 'Free for one plan.' }),
      page.getByRole('article', { name: 'Free' }),
      page.locator('[data-pricing-comparison]'),
      page.locator('[data-slot="cta-banner"]'),
    ]) {
      expect(await leftEdge(locator)).toBeCloseTo(landing, 0);
    }
  });
}

// On a phone the comparison table scrolls sideways; its trailing edge fades
// so the cut-off columns read as more content.
test('the pricing comparison shows a scroll cue on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/pricing');

  const comparison = page.getByRole('region', { name: 'Plan comparison' });
  await comparison.scrollIntoViewIfNeeded();
  await expect(comparison).toHaveAttribute('data-scroll-cue', 'end');
  expect(
    await comparison.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);
  // The fade width eases in over 150ms, so wait for it to settle.
  await expect
    .poll(() =>
      comparison.evaluate((element) => getComputedStyle(element).maskImage),
    )
    .toContain('calc(100% - 40px)');

  // Scrolled to the end, the leading edge fades instead.
  await comparison.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect(comparison).toHaveAttribute('data-scroll-cue', 'start');
});

// A card tilts toward the pointer, and its button must stay the click target
// throughout. `preserve-3d` made card and button tie in hit testing, so presses
// landed on the card and the button never got the click.
test('a pricing card button takes the click while its card tilts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/pricing');

  for (const [plan, action] of [
    ['Free', 'Start free'],
    ['Starter', 'Begin with Starter'],
    ['Pro', 'Begin with Pro'],
  ] as const) {
    const card = page.getByRole('article', { name: plan });
    const button = card.getByRole('button', { name: action });
    await expect(button).toBeVisible();
    if (plan !== 'Free') await card.getByRole('checkbox').check();
    await button.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    // The cards dock in on load; measure once they have landed.
    await card.evaluate(async (element) => {
      // Settled, not all: moving the pointer away can cancel a tilt transition.
      await Promise.allSettled(
        element.getAnimations().map(({ finished }) => finished),
      );
    });

    const box = await button.boundingBox();
    if (!box) throw new Error(`${action} has no box`);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);

    // Across the button, every frame of the tilt and after it settles.
    const misses = await button.evaluate(async (element) => {
      let count = 0;
      for (let frame = 0; frame < 30; frame++) {
        await new Promise(requestAnimationFrame);
        const rect = element.getBoundingClientRect();
        for (let column = 1; column < 12; column++) {
          for (let row = 1; row < 8; row++) {
            const hit = document.elementFromPoint(
              rect.left + (rect.width * column) / 12,
              rect.top + (rect.height * row) / 8,
            );
            if (!hit || !element.contains(hit)) count++;
          }
        }
      }
      return count;
    });
    expect(misses, `${action} points that hit something else`).toBe(0);

    // Stopped here so the sign-in modal doesn't cover the next card.
    const clicked = page.evaluate(
      () =>
        new Promise<string | undefined>((resolve) => {
          window.addEventListener(
            'click',
            (event) => {
              event.preventDefault();
              event.stopImmediatePropagation();
              const target = event.target as Element;
              resolve(target.closest('button')?.textContent ?? target.tagName);
            },
            { capture: true, once: true },
          );
        }),
    );
    await page.mouse.click(x, y, { delay: 60 });
    expect(await clicked).toBe(action);
  }
});

// A paid plan's button stays disabled until the renewal box is ticked; a
// muted hint under it says why and goes away once the box is ticked.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`a disabled paid plan button explains itself in ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/pricing');

    const starter = page.getByRole('article', { name: 'Starter' });
    const begin = starter.getByRole('button', { name: 'Begin with Starter' });
    const hint = starter.getByText('Tick the box above to continue.');
    await expect(begin).toBeDisabled();
    await expect(begin).toHaveAccessibleDescription(
      'Tick the box above to continue.',
    );
    await expect(hint).toBeVisible();
    expect(await hint.evaluate(renderedContrast)).toBeGreaterThanOrEqual(4.5);

    await starter.getByRole('checkbox').check();
    await expect(begin).toBeEnabled();
    await expect(hint).toHaveCount(0);
    await expect(begin).not.toHaveAttribute('aria-describedby');
  });
}
