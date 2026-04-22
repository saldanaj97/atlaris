import {
	ANON_PROTECTED_ROUTES,
	assertRedirectToSignIn,
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
});
