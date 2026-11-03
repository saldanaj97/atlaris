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

test('the mobile menu lists no About link', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/landing');

  await page.getByRole('button', { name: 'Open menu' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('link', { name: 'Pricing' })).toBeVisible();
  await expect(
    sheet.getByRole('link', { name: 'About', exact: true }),
  ).toHaveCount(0);
});
