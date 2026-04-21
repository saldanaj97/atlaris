import type { Page } from '@playwright/test';
import {
  createPlanInput,
  expect,
  expectHeading,
  selectInlineDropdown,
  test,
  waitForGeneratedModules,
} from './fixtures';

test.describe.configure({ mode: 'serial' });
// Keep the suite-level timeout above PLAN_GENERATION_TIMEOUT_MS because this
// single smoke test serializes plan generation plus follow-up navigation and
// billing checks under test.describe.configure({ mode: 'serial' }).
test.setTimeout(180_000);

const ANALYTICS_USAGE_URL = /\/analytics\/usage$/;
const BILLING_URL = /\/settings\/billing(?:\?.*)?$/;
const MODULE_URL = /\/plans\/[0-9a-f-]{36}\/modules\/[0-9a-f-]{36}$/i;
const PLAN_URL = /\/plans\/[0-9a-f-]{36}$/i;
const PLAN_GENERATION_TIMEOUT_MS = 90_000;
const STANDARD_NAVIGATION_TIMEOUT_MS = 15_000;
const CHECKOUT_TIMEOUT_MS = 20_000;

async function expectBillingPage(page: Page): Promise<void> {
  await expectHeading(page, 'Settings');
  await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Current Plan' })
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Usage' })).toBeVisible();
  await expect(page.getByText('Status')).toBeVisible();
  await expect(page.getByText('Next billing date')).toBeVisible();
  await expect(page.getByText(/^active$/i)).toBeVisible();
}

test('authenticated launch blockers stay green', async ({ page }) => {
  const planInput = createPlanInput();

  await test.step('dashboard and plans routes load', async () => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expectHeading(page, 'Activity Feed');

    await page.goto('/plans');
    await expect(page).toHaveURL(/\/plans$/);
    await expectHeading(page, 'Your Plans');

    await page.goto('/plans/new');
    await expect(page).toHaveURL(/\/plans\/new$/);
    await expectHeading(page, /what do you want to learn/i);
  });

  await test.step('manual plan creation and module navigation succeed', async () => {
    await page.getByLabel('What do you want to learn?').fill(planInput.topic);
    await selectInlineDropdown(page, 'Skill level', planInput.skillLevel);
    await selectInlineDropdown(page, 'Weekly hours', planInput.weeklyHours);
    await selectInlineDropdown(page, 'Learning style', planInput.learningStyle);
    await selectInlineDropdown(page, 'Deadline', planInput.deadline);

    const generationResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/plans/stream') &&
        response.request().method() === 'POST'
    );

    await page.getByRole('button', { name: 'Generate my plan' }).click();
    const generationResponse = await generationResponsePromise;
    expect(generationResponse.ok()).toBe(true);

    await expect(page).toHaveURL(PLAN_URL, {
      timeout: PLAN_GENERATION_TIMEOUT_MS,
    });

    const planUrl = page.url();
    await waitForGeneratedModules(page, PLAN_GENERATION_TIMEOUT_MS);
    const generatedModuleLinkCount = await page
      .getByRole('link', { name: /view full module/i })
      .count();
    expect(
      generatedModuleLinkCount,
      'Expected at least one generated module link after plan generation.'
    ).toBeGreaterThan(0);
    const firstModuleLink = page
      .getByRole('link', { name: /view full module/i })
      .first();
    await Promise.all([
      page.waitForURL(MODULE_URL, { timeout: STANDARD_NAVIGATION_TIMEOUT_MS }),
      firstModuleLink.click(),
    ]);

    await expect(page).toHaveURL(MODULE_URL, {
      timeout: STANDARD_NAVIGATION_TIMEOUT_MS,
    });
    const moduleUrlBeforeNext = page.url();
    await expect(page.getByRole('heading', { name: 'Lessons' })).toBeVisible();

    const nextModuleLink = page.getByLabel('Next module');
    if ((await nextModuleLink.count()) > 0) {
      // Some generated plans can legitimately end on a single module, so only
      // exercise next-module navigation when the UI exposes that control.
      await nextModuleLink.click();
      await expect(page).not.toHaveURL(moduleUrlBeforeNext);
      await expect(page).toHaveURL(MODULE_URL);
    }

    await page.getByRole('link', { name: planInput.topic }).click();
    await expect(page).toHaveURL(planUrl);
    await expect(
      page.getByRole('link', { name: /view full module/i }).first()
    ).toBeVisible({
      // Returning to the existing plan page should complete like a normal route navigation.
      timeout: STANDARD_NAVIGATION_TIMEOUT_MS,
    });
  });

  await test.step('analytics redirect lands on usage', async () => {
    await page.goto('/analytics');
    await expect(page).toHaveURL(ANALYTICS_USAGE_URL);
    await expectHeading(page, 'Usage');
  });

  await test.step('starter checkout and local billing portal stay green', async () => {
    await page.goto('/pricing');
    await expect(page).toHaveURL(/\/pricing$/);
    await expectHeading(page, /invest in your growth/i);

    const starterCard = page.locator('[data-slot="card"]').filter({
      has: page.locator('[data-slot="card-title"]', { hasText: /^Starter$/ }),
    });
    const starterCheckoutButton = starterCard.getByRole('button', {
      name: 'Subscribe monthly',
    });

    await expect(starterCheckoutButton).toBeVisible();
    await Promise.all([
      page.waitForURL(BILLING_URL, { timeout: CHECKOUT_TIMEOUT_MS }),
      starterCheckoutButton.click(),
    ]);
    await expectBillingPage(page);

    const manageSubscriptionButton = page.getByRole('button', {
      name: 'Manage Subscription',
    });
    await expect(manageSubscriptionButton).toBeVisible();
    await Promise.all([
      page.waitForURL(
        (url) =>
          url.pathname === '/settings/billing' &&
          url.searchParams.get('local_portal') === '1',
        { timeout: CHECKOUT_TIMEOUT_MS }
      ),
      manageSubscriptionButton.click(),
    ]);
    await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
  });
});
