import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

declare global {
  interface Window {
    __themeTransitions?: string[];
  }
}

/**
 * Records the root theme when each view transition starts and after its update
 * runs: a crossfade needs the old theme captured and the new one committed.
 */
async function recordThemeTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: string[] = [];
    window.__themeTransitions = log;
    const original = document.startViewTransition?.bind(document);
    if (!original) return;
    const theme = () => document.documentElement.dataset.atlarisTheme;
    document.startViewTransition = ((update?: () => void | Promise<void>) => {
      log.push(`start:${theme()}`);
      return original(async () => {
        await update?.();
        log.push(`update:${theme()}`);
      });
    }) as typeof document.startViewTransition;
  });
}

const transitions = (page: Page) =>
  page.evaluate(() => window.__themeTransitions ?? []);

test.beforeEach(async ({ page }) => {
  await recordThemeTransitions(page);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: null });
  await page.goto('/dashboard');
  await expect(page.locator('html')).toHaveAttribute(
    'data-atlaris-theme',
    'light',
  );
});

test('the theme toggle crossfades from the old theme to the new one', async ({
  page,
}) => {
  await page
    .getByRole('button', { name: 'Switch to dark mode' })
    .first()
    .click();

  await expect
    .poll(() => transitions(page))
    .toEqual(['start:light', 'update:dark']);
  await expect(page.locator('html')).toHaveAttribute(
    'data-atlaris-theme',
    'dark',
  );
});

test('an OS theme change crossfades while the theme follows the system', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });

  await expect
    .poll(() => transitions(page))
    .toEqual(['start:light', 'update:dark']);
  await expect(page.locator('html')).toHaveAttribute(
    'data-atlaris-theme',
    'dark',
  );
});

test('reduced motion switches the theme without a transition', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page
    .getByRole('button', { name: 'Switch to dark mode' })
    .first()
    .click();

  await expect(page.locator('html')).toHaveAttribute(
    'data-atlaris-theme',
    'dark',
  );
  expect(await transitions(page)).toEqual([]);
});
