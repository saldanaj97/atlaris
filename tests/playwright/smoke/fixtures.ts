import {
  type APIResponse,
  test as base,
  expect,
  type Page,
} from '@playwright/test';

export const test = base;
export { expect };

export const ANON_PROTECTED_ROUTES = [
  '/dashboard',
  '/plans',
  '/plans/new',
  '/settings/profile',
  '/settings/billing',
  '/settings/ai',
  '/settings/integrations',
  '/settings/notifications',
  '/analytics',
  '/analytics/usage',
  '/analytics/achievements',
] as const;

interface PlanInput {
  deadline: string;
  learningStyle: string;
  skillLevel: string;
  topic: string;
  weeklyHours: string;
}

const DEFAULT_PLAN_INPUT: PlanInput = {
  deadline: '2 weeks',
  learningStyle: 'Reading',
  skillLevel: 'Advanced',
  topic: 'Learn Rust',
  weeklyHours: '11-15 hours',
};

export function createPlanInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    ...DEFAULT_PLAN_INPUT,
    ...overrides,
  };
}

type HeadingName = RegExp | string;

export function assertRedirectToSignIn(
  response: APIResponse,
  route: string,
): void {
  expect(response.status(), `${route} should redirect anonymous users`).toBe(
    307,
  );
  expect(
    response.headers().location,
    `${route} should point at the sign-in page`,
  ).toContain('/auth/sign-in');
}

export async function expectHeading(
  page: Page,
  name: HeadingName,
): Promise<void> {
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

export async function selectInlineDropdown(
  page: Page,
  label: string,
  optionLabel: string,
): Promise<void> {
  await page.getByLabel(label).click();
  await page.getByRole('option', { name: optionLabel }).click();
}

const PLAN_GENERATION_TIMEOUT_MS = 60_000;
const MODULE_LINK_VISIBLE_TIMEOUT_MS = 500;
const PLAN_RELOAD_INTERVAL_MS = 2_000;

async function checkGeneratedModules(page: Page): Promise<void> {
  const firstModuleLink = page
    .getByRole('link', { name: /view full module/i })
    .first();
  const emptyState = page.getByText('No modules available yet.');
  const pendingErrorAlert = page
    .getByText(/generation failed|connection issue/i)
    .first();

  try {
    await firstModuleLink.waitFor({
      state: 'visible',
      timeout: MODULE_LINK_VISIBLE_TIMEOUT_MS,
    });
    return;
  } catch (_error) {
    // Fall through to error and empty-state checks before retrying.
  }

  if (await pendingErrorAlert.isVisible()) {
    throw new Error(
      `Plan generation surfaced an error before modules became available: "${await pendingErrorAlert.innerText()}"`,
    );
  }

  if (await emptyState.isVisible()) {
    await page.reload({ waitUntil: 'domcontentloaded' });
  }

  throw new Error('Generated modules are not visible yet.');
}

export async function waitForGeneratedModules(
  page: Page,
  timeoutMs = PLAN_GENERATION_TIMEOUT_MS,
): Promise<void> {
  const emptyState = page.getByText('No modules available yet.');
  try {
    await expect(async () => checkGeneratedModules(page)).toPass({
      intervals: [PLAN_RELOAD_INTERVAL_MS],
      timeout: timeoutMs,
    });
  } catch (error) {
    const isTimeoutError =
      error instanceof Error && error.name === 'TimeoutError';

    if (!isTimeoutError && error instanceof Error) {
      throw error;
    }

    if (await emptyState.isVisible()) {
      throw new Error(
        'Timed out waiting for generated modules; plan page remained in the empty "No modules available yet." state.',
        { cause: error },
      );
    }

    throw new Error(
      'Timed out waiting for generated modules; no module link appeared on the plan page.',
      { cause: error },
    );
  }
}
