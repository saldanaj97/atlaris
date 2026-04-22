import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTestUser, setTestUser } from '@/../tests/helpers/auth';
import { requireCurrentUserRecord } from '@/lib/api/auth';

describe('local product testing identity', () => {
	beforeEach(() => {
		vi.stubEnv('LOCAL_PRODUCT_TESTING', 'true');
	});

	afterEach(() => {
		clearTestUser();
		vi.unstubAllEnvs();
	});

	it('rejects when no user row exists for DEV_AUTH_USER_ID', async () => {
		setTestUser('ghost-user-not-in-database');
		await expect(requireCurrentUserRecord()).rejects.toThrow(
			/Local product testing requires a seeded user row/,
		);
	});
});
