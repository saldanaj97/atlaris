import { expect, test } from './fixtures';

// Free allows one plan in total, not one plan at a time, so the landing copy
// must never call it an "active" plan.
test('landing describes the Free allowance as one plan', async ({ page }) => {
  await page.goto('/landing');

  await expect(
    page.getByText('Free plan: one plan, up to two weeks', { exact: true }),
  ).toBeVisible();

  const closingCopy = page.getByText('Free plan: one plan, up to two weeks.', {
    exact: true,
  });
  await closingCopy.scrollIntoViewIfNeeded();
  await expect(closingCopy).toBeVisible();

  await expect(page.locator('main')).not.toContainText(/active plan/i);
});
