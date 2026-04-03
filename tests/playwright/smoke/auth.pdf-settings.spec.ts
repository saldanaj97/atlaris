import type { Page } from '@playwright/test';

import {
  expect,
  expectHeading,
  test,
  waitForGeneratedModules,
} from './fixtures';
import {
  writeInvalidUploadFixture,
  writeSmokePdfFixture,
} from './helpers/pdf-fixture';

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const PLAN_URL = /\/plans\/[0-9a-f-]{36}$/i;
const MODULE_URL = /\/plans\/[0-9a-f-]{36}\/modules\/[0-9a-f-]{36}$/i;
const PDF_EXTRACTION_TIMEOUT_MS = 45_000;
const PDF_PLAN_GENERATION_TIMEOUT_MS = 90_000;

async function openPdfPlanFlow(page: Page): Promise<void> {
  await page.goto('/plans/new');
  await expect(page).toHaveURL(/\/plans\/new$/);
  await page.getByRole('tab', { name: 'Upload PDF' }).click();
  await expect(page).toHaveURL(/\/plans\/new\?method=pdf$/);
  await expect(
    page.getByRole('heading', { name: 'Upload your PDF' })
  ).toBeVisible();
}

async function setPdfDeadlineToTwoWeeks(page: Page): Promise<void> {
  const deadlineTrigger = page
    .getByRole('region', { name: 'Plan Settings' })
    .getByRole('combobox', { name: 'Deadline' });
  await expect(deadlineTrigger).toBeVisible();
  await deadlineTrigger.click();
  await page.getByRole('option', { name: '2 weeks' }).click();
}

async function chooseDifferentPreferredModel(page: Page): Promise<string> {
  const modelTrigger = page.getByLabel('Preferred AI Model');
  await expect(modelTrigger).toBeVisible();

  const currentLabel = (await modelTrigger.textContent())?.trim() ?? '';
  await modelTrigger.click();

  const options = page.getByRole('option');
  const optionCount = await options.count();

  for (let index = 0; index < optionCount; index += 1) {
    const option = options.nth(index);
    const modelName = (await option.innerText()).split('\n')[0]?.trim() ?? '';

    if (!modelName || /select a model/i.test(modelName)) {
      continue;
    }

    if (currentLabel?.includes(modelName)) {
      continue;
    }

    await option.click();
    return modelName;
  }

  throw new Error('Could not find a different persistable AI model option.');
}

test('pdf upload rejects obviously invalid files', async ({
  page,
}, testInfo) => {
  await openPdfPlanFlow(page);

  const invalidFilePath = await writeInvalidUploadFixture(testInfo);
  await page.locator('input[type="file"]').setInputFiles(invalidFilePath);

  await expect(page.getByText('Please select a valid PDF file.')).toBeVisible();
});

test('pdf upload and generation stay green for the seeded free-tier user', async ({
  page,
}, testInfo) => {
  await openPdfPlanFlow(page);

  const pdfPath = await writeSmokePdfFixture(
    testInfo,
    'Learn distributed systems'
  );
  await page.locator('input[type="file"]').setInputFiles(pdfPath);

  await expect(
    page.getByRole('heading', { name: 'PDF Extracted Successfully' })
  ).toBeVisible({ timeout: PDF_EXTRACTION_TIMEOUT_MS });
  await expect(page.getByLabel('Main Topic')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Generate Learning Plan' })
  ).toBeVisible({ timeout: PDF_EXTRACTION_TIMEOUT_MS });

  await setPdfDeadlineToTwoWeeks(page);

  await page.getByRole('button', { name: 'Generate Learning Plan' }).click();
  await expect(page).toHaveURL(PLAN_URL, { timeout: 60_000 });

  await waitForGeneratedModules(page, PDF_PLAN_GENERATION_TIMEOUT_MS);
  const generatedModuleLinkCount = await page
    .getByRole('link', { name: /view full module/i })
    .count();
  expect(
    generatedModuleLinkCount,
    'Expected at least one generated module link after PDF plan generation.'
  ).toBeGreaterThan(0);
  const firstModuleLink = page
    .getByRole('link', { name: /view full module/i })
    .first();
  await firstModuleLink.click();

  await expect(page).toHaveURL(MODULE_URL);
  await expect(page.getByRole('heading', { name: 'Lessons' })).toBeVisible();
});

test('profile settings persist across reload', async ({ page }) => {
  const profileName = `Smoke Test ${Date.now()}`;

  await page.goto('/settings/profile');
  await expectHeading(page, 'Settings');
  await expect(
    page.getByRole('heading', { name: 'Personal Information' })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Edit profile name' }).click();
  await page.locator('#profile-name').fill(profileName);
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Profile updated').first()).toBeVisible();

  await page.reload();
  await expect(page.getByText(profileName)).toBeVisible();
});

test('ai preferences persist across reload', async ({ page }) => {
  await page.goto('/settings/ai');
  await expectHeading(page, 'Settings');
  await expect(
    page.getByRole('heading', { name: 'AI Preferences' })
  ).toBeVisible();
  await expect(page.getByLabel('Preferred AI Model')).toBeVisible();

  const selectedModelLabel = await chooseDifferentPreferredModel(page);
  const preferenceResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/user/preferences') &&
      response.request().method() === 'PATCH',
    { timeout: 5_000 }
  );
  await page.getByRole('button', { name: 'Save Preferences' }).click();
  const preferenceResponse = await preferenceResponsePromise;
  expect(preferenceResponse.ok()).toBe(true);

  await page.reload();
  await expect(page.getByLabel('Preferred AI Model')).toContainText(
    selectedModelLabel
  );
});

test('integrations and notifications pages load successfully', async ({
  page,
}) => {
  await page.goto('/settings/integrations');
  await expectHeading(page, 'Settings');
  await expect(
    page.getByRole('heading', { name: 'Integrations' })
  ).toBeVisible();
  await expect(
    page.getByText(
      'Connect your favorite tools to supercharge your learning workflow'
    )
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Request Integration' })
  ).toBeVisible();

  await page.goto('/settings/notifications');
  await expectHeading(page, 'Settings');
  await expect(
    page.getByRole('heading', { name: 'Notifications' })
  ).toBeVisible();
  await expect(
    page.getByText('Personalized alerts are on the way')
  ).toBeVisible();
  await expect(page.getByLabel('Daily study reminder')).toBeDisabled();
});
