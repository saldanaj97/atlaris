import { test, expect } from '@playwright/test';

test.describe('Plan Schedule View', () => {
  test('should toggle between modules and schedule view', async ({ page }) => {
    // NOTE: This test requires a seeded plan with modules/tasks
    // Adjust plan ID based on your test database setup
    await page.goto('/plans/test-plan-id');

    // Verify default view is modules
    await expect(page.getByRole('heading', { name: /modules/i })).toBeVisible();

    // Click schedule tab
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Verify schedule view is displayed
    await expect(page.getByText(/Week 1/i)).toBeVisible();

    // Click modules tab
    await page.getByRole('tab', { name: /modules/i }).click();

    // Verify modules view is restored
    await expect(page.getByRole('heading', { name: /modules/i })).toBeVisible();
  });

  test('should display week-grouped schedule with dates', async ({ page }) => {
    await page.goto('/plans/test-plan-id');
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Verify week structure
    await expect(page.getByText(/Week 1/i)).toBeVisible();

    // Verify dates are displayed
    await expect(page.getByText(/\d{4}-\d{2}-\d{2}/)).toBeVisible();

    // Verify task time estimates
    await expect(page.getByText(/\d+ (min|hr)/i)).toBeVisible();
  });
});
