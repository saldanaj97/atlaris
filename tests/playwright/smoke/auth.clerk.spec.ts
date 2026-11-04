import { expect, renderedContrast, test } from './fixtures';
import { clerk, clerkSetup } from '@clerk/testing/playwright';

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
      page.getByRole('heading', { name: /Welcome back/ }),
    ).toBeVisible();
  });

  // Clerk paints its text actions, the active tab and badges itself; the
  // cantaloupe text on white measured 2.7:1 and the dark badge 1.2:1.
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`account modal text is readable in ${colorScheme}`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await page.emulateMedia({ colorScheme });
      await page.goto('/');
      await clerk.signIn({ page, emailAddress: getClerkSmokeUserEmail()! });
      await page.goto('/settings/profile');

      // Keyboard, not clicks: the Next dev overlay covers the sidebar's user button.
      await page
        .getByRole('button', { name: 'Open user menu' })
        .filter({ visible: true })
        .first()
        .press('Enter');
      await page.getByRole('button', { name: 'Manage account' }).press('Enter');
      const modal = page.locator('.cl-userProfile-root');
      const texts = [
        modal.getByRole('button', { name: 'Update profile' }),
        modal.locator(
          '.cl-navbarButton[data-active="true"] .cl-navbarButtonText',
        ),
        modal.locator('.cl-badge').first(),
      ];
      // Polled: the modal fades in, and the helper counts that opacity.
      for (const text of texts) {
        await expect
          .poll(() => text.evaluate(renderedContrast))
          .toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  // Sign-up's "Join waitlist" is a plain solid button, not formButtonPrimary,
  // so it must still share sign-in's cantaloupe fill.
  test('the waitlist button matches the sign-in button', async ({ page }) => {
    const fill = async (path: string, name: string) => {
      await page.goto(path);
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toBeVisible();
      return button.evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, color: style.color };
      });
    };

    const signIn = await fill('/auth/sign-in', 'Continue');
    expect(await fill('/auth/sign-up', 'Join waitlist')).toEqual(signIn);
  });
});
