import { expect, test } from './fixtures';

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
  const cue = await comparison.evaluate((element) => ({
    overflows: element.scrollWidth > element.clientWidth,
    mask: getComputedStyle(element).maskImage,
  }));

  expect(cue.overflows).toBe(true);
  expect(cue.mask).toContain('calc(100% - 40px)');

  // Scrolled to the end, the leading edge fades instead.
  await comparison.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect(comparison).toHaveAttribute('data-scroll-cue', 'start');
});
