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
const SETTINGS_URL = /\/settings\/billing$/;
const MODULE_URL = /\/plans\/[0-9a-f-]{36}\/modules\/[0-9a-f-]{36}$/i;
const PLAN_URL = /\/plans\/[0-9a-f-]{36}$/i;
const PLAN_GENERATION_TIMEOUT_MS = 90_000;
const STANDARD_NAVIGATION_TIMEOUT_MS = 15_000;

/**
 * WCAG contrast of an element's text against what is painted behind it:
 * every ancestor's background is layered in order and every ancestor's
 * opacity is applied, so faded or translucent rows count as they render.
 */
function renderedTextContrast(element: Element): number {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) throw new Error('2D canvas unavailable');
  const pixel = () =>
    Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
  const luminance = ([r, g, b]: number[]) => {
    const [lr, lg, lb] = [r, g, b].map((value) => {
      const channel = value / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  };
  const chain: Element[] = [];
  for (let node: Element | null = element; node; node = node.parentElement) {
    chain.unshift(node);
  }
  context.fillStyle = '#fff';
  context.fillRect(0, 0, 1, 1);
  let opacity = 1;
  for (const node of chain) {
    const style = getComputedStyle(node);
    opacity *= Number.parseFloat(style.opacity);
    context.fillStyle = style.backgroundColor;
    context.fillRect(0, 0, 1, 1);
  }
  const background = luminance(pixel());
  context.globalAlpha = opacity;
  context.fillStyle = getComputedStyle(element).color;
  context.fillRect(0, 0, 1, 1);
  const text = luminance(pixel());
  const [lighter, darker] = [background, text].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

async function expectBillingPage(page: Page): Promise<void> {
  await expectHeading(page, 'Settings', 1);
  await expectHeading(page, 'Billing', 2);
  await expect(
    page.getByRole('heading', { name: 'Usage', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('Status')).toBeVisible();
  await expect(page.getByText('Next billing date')).toBeVisible();
  await expect(page.getByText(/^active$/i)).toBeVisible();
}

/** WCAG contrast of an element's text color on its own background. */
function textContrast(element: Element): number {
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
      return channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const style = getComputedStyle(element);
  const [lighter, darker] = [
    luminance(style.color),
    luminance(style.backgroundColor),
  ].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test('authenticated launch blockers stay green', async ({ page }) => {
  const planInput = createPlanInput();

  await test.step('dashboard and plans routes load', async () => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expectHeading(page, /Welcome back/);

    await page.goto('/plans');
    await expect(page).toHaveURL(/\/plans$/);
    await expectHeading(page, 'Your Plans');

    await page.goto('/plans/new');
    await expect(page).toHaveURL(/\/plans\/new$/);
    await expectHeading(page, /what do you want to learn/i);
  });

  await test.step('manual plan creation and module navigation succeed', async () => {
    await page.getByLabel('Topic', { exact: true }).fill(planInput.topic);
    await selectInlineDropdown(page, 'Skill level', planInput.skillLevel);
    await selectInlineDropdown(page, 'Weekly hours', planInput.weeklyHours);
    await selectInlineDropdown(page, 'Learning style', planInput.learningStyle);
    await selectInlineDropdown(page, 'Deadline', planInput.deadline);

    const generationResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/plans' &&
        response.request().method() === 'POST',
    );

    await page.getByRole('button', { name: 'Chart this course' }).click();
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
      'Expected at least one generated module link after plan generation.',
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

    // A locked lesson stays legible: its title and "Locked" badge keep text
    // contrast in both themes instead of fading the whole row.
    const lockedLesson = page.locator('[data-progress-state="locked"]').first();
    if ((await lockedLesson.count()) > 0) {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme });
        await expect(page.locator('html')).toHaveAttribute(
          'data-atlaris-theme',
          colorScheme,
        );
        for (const label of [
          // Radix wraps the trigger in its own h3; the title is the one inside.
          lockedLesson.getByRole('button').locator('h3'),
          lockedLesson.getByText('Locked', { exact: true }),
        ]) {
          expect(
            await label.evaluate(renderedTextContrast),
            `locked lesson text in ${colorScheme}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      await page.emulateMedia({ colorScheme: null });
    }

    // The focused current module keeps readable text on its selected surface.
    await page.getByRole('button', { name: /^Module \d+$/ }).click();
    await page.keyboard.press('ArrowDown');
    const currentModuleItem = page.locator(
      '[role="menuitem"][aria-current="page"]',
    );
    await expect(currentModuleItem).toBeFocused();
    expect(
      await currentModuleItem.evaluate(textContrast),
    ).toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press('Escape');

    const nextModuleLink = page.getByRole('link', {
      name: 'Next module',
      exact: true,
    });
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
      page.getByRole('link', { name: /view full module/i }).first(),
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

  await test.step('Clerk pricing and billing settings stay green', async () => {
    await page.goto('/pricing');
    await expect(page).toHaveURL(/\/pricing$/);
    await expectHeading(page, /free for one plan\. pay when you need more/i);

    await page.goto('/settings/billing');
    await expect(page).toHaveURL(SETTINGS_URL);
    await expectBillingPage(page);
  });
});
