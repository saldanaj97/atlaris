import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/lib/logging/logger';
import { clearTestUser, setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

describe('withErrorBoundary client abort (integration)', () => {
	const authUserId = buildTestAuthUserId('middleware-abort-profile-user');

	beforeEach(async () => {
		setTestUser(authUserId);
		await ensureUser({
			authUserId,
			email: buildTestEmail(authUserId),
		});
	});

	afterEach(() => {
		clearTestUser();
		vi.restoreAllMocks();
	});

	it('returns 499 when req.json rejects AbortError on PUT /api/v1/user/profile', async () => {
		const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
		const { PUT } = await import('@/app/api/v1/user/profile/route');
		const abort = new Error('aborted');
		abort.name = 'AbortError';
		const request = new Request('http://localhost/api/v1/user/profile', {
			method: 'PUT',
			headers: new Headers({ 'Content-Type': 'application/json' }),
		});
		Object.defineProperty(request, 'json', {
			value: () => Promise.reject(abort),
		});

		const response = await PUT(request);

		expect(response.status).toBe(499);
		expect(errorSpy).not.toHaveBeenCalled();
	});
});
