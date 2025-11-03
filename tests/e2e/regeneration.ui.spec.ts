import { test, _expect } from '@playwright/test';

test('free user sees 2-week cap prompt', async ({ _page }) => {
  // setup user tier = free, navigate to onboarding
  // select >2 week deadline -> expect upgrade prompt text
});

test('paid user sees Regenerate button and regenerates', async ({ _page }) => {
  // setup user tier = pro, visit plan details -> Regenerate
});
