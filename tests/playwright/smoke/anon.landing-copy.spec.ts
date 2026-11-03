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

  // Paid tiers hold plans at a time ("10 active plans"); Free never does.
  await expect(
    page.locator('section[aria-labelledby="landing-hero-heading"]'),
  ).not.toContainText(/active plan/i);
  const freeTier = page
    .locator('section[aria-labelledby="landing-pricing-heading"] li')
    .filter({ has: page.getByRole('heading', { name: 'Free', exact: true }) });
  await expect(freeTier).toContainText('1 plan included');
  await expect(freeTier).not.toContainText(/active plan/i);
});

// Below the hero, each section answers one question for a first-time visitor:
// the problem, how it works, what a plan holds, what it costs, why start now.
test('landing sections come in order, with limits but no prices', async ({
  page,
}) => {
  await page.goto('/landing');

  await expect(page.locator('main h2')).toHaveText([
    "Most plans are written for hours you don't have",
    'How a plan comes together',
    "What's inside a plan",
    'Pay only when you need more room',
    'Start with one free plan',
  ]);

  const planSection = page.locator(
    'section[aria-labelledby="landing-plan-heading"]',
  );
  await expect(
    planSection.getByRole('list').first().getByRole('listitem'),
  ).toHaveCount(4);

  // Tier lines come from the same limits as /pricing and checkout.
  const pricingSection = page.locator(
    'section[aria-labelledby="landing-pricing-heading"]',
  );
  const starter = pricingSection.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Starter', exact: true }),
  });
  await expect(starter).toContainText('Plans up to 8 weeks');
  await expect(starter).toContainText('5 regenerations per month');
  await expect(pricingSection).not.toContainText('$');
  await expect(
    pricingSection.getByRole('link', { name: 'Compare plans' }),
  ).toHaveAttribute('href', '/pricing');
});
