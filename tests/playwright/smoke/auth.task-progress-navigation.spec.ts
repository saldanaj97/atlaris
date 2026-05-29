import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  TASK_PROGRESS_SMOKE_FIXTURE,
  fixtureModulePath,
  fixturePlanPath,
} from './helpers/task-progress-fixtures';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const NAVIGATION_TIMEOUT_MS = 15_000;
const PERSISTENCE_TIMEOUT_MS = 20_000;
const PAGE_READY_TIMEOUT_MS = 60_000;
const INITIAL_PLAN_COMPILE_TIMEOUT_MS = 180_000;

function taskCard(page: Page, taskTitle: string) {
  return page.locator('div.rounded-2xl').filter({ hasText: taskTitle });
}

function markCompleteButton(page: Page, taskTitle: string) {
  return taskCard(page, taskTitle).getByRole('button', {
    name: 'Mark task as complete',
  });
}

function markIncompleteButton(page: Page, taskTitle: string) {
  return taskCard(page, taskTitle).getByRole('button', {
    name: 'Mark task as incomplete',
  });
}

async function gotoPlanReady(
  page: Page,
  planPath: string,
  planTopic: string,
): Promise<void> {
  page.setDefaultNavigationTimeout(PAGE_READY_TIMEOUT_MS);

  const apiResponse = await page.request.get(
    `/api/v1/plans/${TASK_PROGRESS_SMOKE_FIXTURE.planId}`,
  );
  expect(
    apiResponse.ok(),
    'fixture plan API should be readable in auth smoke',
  ).toBe(true);

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto(planPath, {
    waitUntil: 'commit',
    timeout: INITIAL_PLAN_COMPILE_TIMEOUT_MS,
  });
  await expect(page).toHaveURL(new RegExp(`${planPath}$`));
  await expect(
    page.getByRole('heading', { name: planTopic, level: 2 }),
  ).toBeVisible({ timeout: PAGE_READY_TIMEOUT_MS });
  await expect(
    page.getByRole('heading', { name: 'Learning Modules' }),
  ).toBeVisible({ timeout: PAGE_READY_TIMEOUT_MS });
}

async function gotoModuleReady(page: Page, modulePath: string): Promise<void> {
  await Promise.all([
    page.waitForURL(new RegExp(`${modulePath}$`), {
      timeout: PAGE_READY_TIMEOUT_MS,
    }),
    page
      .getByRole('link', { name: /view full module/i })
      .first()
      .click(),
  ]);
  await expect(page.getByRole('heading', { name: 'Lessons' })).toBeVisible({
    timeout: PAGE_READY_TIMEOUT_MS,
  });
}

async function returnToPlanFromModule(
  page: Page,
  planPath: string,
  planTopic: string,
) {
  await page.getByRole('link', { name: planTopic }).click();
  await expect(page).toHaveURL(new RegExp(`${planPath}$`), {
    timeout: NAVIGATION_TIMEOUT_MS,
  });
}

async function openModuleFromPlan(page: Page, modulePath: string) {
  await Promise.all([
    page.waitForURL(new RegExp(`${modulePath}$`), {
      timeout: NAVIGATION_TIMEOUT_MS,
    }),
    page
      .getByRole('link', { name: /view full module/i })
      .first()
      .click(),
  ]);
}

async function expectTaskPersistedAsComplete(
  page: Page,
  taskTitle: string,
): Promise<void> {
  await expect(async () => {
    await page.reload({ waitUntil: 'commit' });
    await expect(markIncompleteButton(page, taskTitle)).toBeVisible();
  }).toPass({
    intervals: [500],
    timeout: PERSISTENCE_TIMEOUT_MS,
  });
}

test('task progress survives concurrent navigation from plan and module pages', async ({
  page,
}) => {
  const { planTopic, tasks, moduleTitle } = TASK_PROGRESS_SMOKE_FIXTURE;
  const planPath = fixturePlanPath();
  const modulePath = fixtureModulePath();

  await test.step('plan timeline: toggle task and navigate before debounce flush', async () => {
    await gotoPlanReady(page, planPath, planTopic);

    await expect(
      page.getByRole('button', { name: new RegExp(moduleTitle, 'i') }),
    ).toBeVisible();

    const completeButton = markCompleteButton(page, tasks.planNavigate);
    await expect(completeButton).toBeVisible();

    await completeButton.click();
    await openModuleFromPlan(page, modulePath);

    await returnToPlanFromModule(page, planPath, planTopic);

    await expectTaskPersistedAsComplete(page, tasks.planNavigate);
  });

  await test.step('module detail: toggle lesson and return before debounce flush', async () => {
    await gotoModuleReady(page, modulePath);

    await expect(markIncompleteButton(page, tasks.planNavigate)).toBeVisible();

    const moduleLessonTrigger = page.getByRole('button', {
      name: new RegExp(tasks.moduleNavigate, 'i'),
    });
    await moduleLessonTrigger.click();

    const moduleLessonComplete = markCompleteButton(page, tasks.moduleNavigate);
    await expect(moduleLessonComplete).toBeVisible();
    await moduleLessonComplete.click();

    await returnToPlanFromModule(page, planPath, planTopic);

    await openModuleFromPlan(page, modulePath);
    await expectTaskPersistedAsComplete(page, tasks.moduleNavigate);
  });
});
