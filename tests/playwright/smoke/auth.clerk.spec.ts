import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { expect, test } from './fixtures';

function getClerkSmokeUserEmail(): string | undefined {
  return process.env.CLERK_E2E_USER_EMAIL;
}

function hasClerkSmokeEnv(): boolean {
  return Boolean(
    getClerkSmokeUserEmail() &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
  );
}

test.describe('Clerk auth parity', () => {
  test.skip(!hasClerkSmokeEnv(), 'Clerk smoke auth env is not configured.');

  test.beforeAll(async () => {
    await clerkSetup({ dotenv: false });
  });

  test('email token sign-in reaches dashboard', async ({ page }) => {
    test.setTimeout(180_000);
    const emailAddress = getClerkSmokeUserEmail()!;

    await page.goto('/');
    await clerk.signIn({ page, emailAddress });
    // Post-sign-in redirects are configurable, so navigate explicitly to keep this smoke deterministic.
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole('heading', { name: 'Activity Feed' }),
    ).toBeVisible();
  });
});
