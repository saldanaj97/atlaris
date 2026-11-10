import { expect, test } from './fixtures';

// Atlaris is paid-only: the landing page must not advertise a free plan.
test('landing offers Starter and Pro, with no free plan', async ({ page }) => {
  await page.goto('/landing');

  await expect(
    page.getByText('Starter and Pro plans. Cancel any time.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/free plan|free for/i);

  // Both tiers hold plans at a time ("10 active plans"); the hero never says so.
  await expect(
    page.locator('section[aria-labelledby="landing-hero-heading"]'),
  ).not.toContainText(/active plan/i);
  const tiers = page.locator(
    'section[aria-labelledby="landing-pricing-heading"] li',
  );
  await expect(
    tiers.filter({
      has: page.getByRole('heading', { name: 'Free', exact: true }),
    }),
  ).toHaveCount(0);
  await expect(
    tiers.filter({
      has: page.getByRole('heading', { name: 'Starter', exact: true }),
    }),
  ).toContainText('10 active plans');
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
    'Two plans, sized to your pace',
    'Start your first plan',
  ]);

  const planSection = page.locator(
    'section[aria-labelledby="landing-plan-heading"]',
  );
  await expect(
    planSection.getByRole('list').first().getByRole('listitem'),
  ).toHaveCount(3);

  // Tasks carry no resources, so the page must not promise any.
  await expect(page.locator('main')).not.toContainText(
    /resources|web research/i,
  );

  // The plan section's CTA closes it, after the won't-do list.
  const wontDo = planSection.getByRole('list').nth(1);
  const planCta = planSection.getByRole('link', { name: 'Create a plan' });
  const [listBox, ctaBox] = await Promise.all([
    wontDo.boundingBox(),
    planCta.boundingBox(),
  ]);
  expect(ctaBox!.y).toBeGreaterThan(listBox!.y + listBox!.height - 1);

  // Tier lines come from the same limits as /pricing and checkout.
  const pricingSection = page.locator(
    'section[aria-labelledby="landing-pricing-heading"]',
  );
  const starter = pricingSection.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: 'Starter', exact: true }),
  });
  await expect(starter).toContainText('Plans up to 8 weeks');
  await expect(starter).toContainText('5 regenerations per month');
  // Every tier gets lessons, so the summary leaves that line to /pricing.
  await expect(pricingSection).not.toContainText('Lessons for every module');
  await expect(pricingSection).not.toContainText('$');
  await expect(
    pricingSection.getByRole('link', { name: 'Compare plans' }),
  ).toHaveAttribute('href', '/pricing');
});

// The example plan reads as one plan: four 2-hr modules over two weeks, the
// first two done and Generics in practice started, as in the hero. Modules
// are labelled by order, as on the plan page, not as weeks.
test('landing plan preview agrees with the hero example', async ({ page }) => {
  await page.goto('/landing');

  const preview = page.locator(
    'section[aria-labelledby="landing-plan-heading"] figure',
  );
  await expect(preview).toContainText('2 of 4 modules');
  await expect(preview).toContainText('8 hrs planned');
  await expect(preview).toContainText(/Module 3/i);
  await expect(preview).not.toContainText(/Week \d/i);
  for (const task of [
    'Read: generic constraints',
    'Exercise: type a fetch helper',
    'Review: Module 3 notes',
  ]) {
    await expect(preview).toContainText(task);
  }

  const howSection = page.locator(
    'section[aria-labelledby="landing-how-heading"]',
  );
  await expect(howSection).toContainText(
    '4 modules · 11 tasks · 8 hrs planned',
  );
  await expect(howSection).toContainText(
    'Module 3 of 4 · 1.5 hrs of 2 hrs done',
  );

  // The hero's current-module card is Generics in practice (2 hrs), and its
  // progress card counts the whole plan: 5.5 of 8 hrs.
  const hero = page.locator('section[aria-labelledby="landing-hero-heading"]');
  await expect(hero).toContainText('Module 3 of 4');
  await expect(hero).toContainText('2 hrs planned · 1.5 hrs done');
  await expect(hero).toContainText('5.5 hrs of 8 hrs');

  // Plans aren't scheduled by week, so neither section says they are.
  for (const section of [hero, howSection]) {
    await expect(section).not.toContainText(
      /Week \d|this week|week at a time|weekly modules/i,
    );
  }
});

// Each section after the problem statement opens on the same rule, and the
// closing banner carries no horizon streak.
test('landing sections share one divider and the CTA card is plain', async ({
  page,
}) => {
  await page.goto('/landing');

  for (const id of [
    'landing-how-heading',
    'landing-plan-heading',
    'landing-pricing-heading',
  ]) {
    const width = await page
      .locator(`section[aria-labelledby="${id}"]`)
      .evaluate((section) => {
        const rule = section.querySelector(':scope > * > div');
        return rule ? getComputedStyle(rule).borderTopWidth : null;
      });
    expect(width, id).toBe('1px');
  }

  await expect(
    page.locator(
      'section[aria-labelledby="landing-cta-heading"] [data-slot="horizon-arc"]',
    ),
  ).toHaveCount(0);
});
