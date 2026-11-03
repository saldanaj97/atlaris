import {
  ANON_PROTECTED_ROUTES,
  assertRedirectToSignIn,
  expect,
  test,
} from './fixtures';

test.describe('anonymous protected-route redirects', () => {
  for (const route of ANON_PROTECTED_ROUTES) {
    test(`${route} responds with a sign-in redirect`, async ({
      request,
      baseURL,
    }) => {
      const response = await request.get(`${baseURL}${route}`, {
        failOnStatusCode: false,
        maxRedirects: 0,
      });

      assertRedirectToSignIn(response, route);
    });
  }

  // The landing and pricing calls to action open the plan form, so new visitors land on sign-up.
  test('/plans/new responds with a sign-up redirect back to the form', async ({
    request,
    baseURL,
  }) => {
    const response = await request.get(`${baseURL}/plans/new`, {
      failOnStatusCode: false,
      maxRedirects: 0,
    });

    expect(response.status()).toBe(307);
    const location = new URL(response.headers().location, baseURL);
    expect(location.pathname).toBe('/auth/sign-up');
    expect(location.searchParams.get('redirect_url')).toBe('/plans/new');
  });
});
