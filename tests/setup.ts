import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import {
	isClientInitialized,
	resetServiceRoleClientForTests,
} from '@/lib/db/service-role';

// Log test configuration for debugging
beforeAll(() => {
	if (process.env.USE_LOCAL_NEON === 'true') {
		console.log('[Test Setup] Using LOCAL Neon configuration (Docker Compose)');
	}
});

afterEach(() => {
	cleanup();
});

afterAll(async () => {
	if (isClientInitialized()) {
		await resetServiceRoleClientForTests();
	}
});
