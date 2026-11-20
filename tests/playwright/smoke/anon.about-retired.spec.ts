import { expect, test } from './fixtures';

// /about is retired behind the fail-closed `about-page` flag, so the route
// answers 404.
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
