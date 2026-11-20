import { expect, test } from './fixtures';

// /about is retired behind the fail-closed `about-page` flag: the route
// answers 404 and no marketing surface links to it.
test('/about answers 404 with the not-found page', async ({
  page,
  request,
  baseURL,
}) => {
  const response = await request.get(`${baseURL}/about`, {
    failOnStatusCode: false,
    maxRedirects: 0,
  });
  expect(response.status()).toBe(404);

  await page.goto('/about');
  await expect(page.getByText('Page not found')).toBeVisible();
});

for (const route of ['/landing', '/pricing'] as const) {
  test(`${route} links nowhere to /about`, async ({ page }) => {
    await page.goto(route);

    await expect(page.locator('a[href="/about"]')).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'About', exact: true }),
    ).toHaveCount(0);
  });
}
