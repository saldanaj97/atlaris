import { appEnv } from '@/lib/config/env';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import { getDb } from '@/lib/db/runtime';

// Streamed plan generation can legitimately hold the dedicated RLS connection
// open for a few minutes while AI output is produced and persisted.
const RLS_IDLE_TIMEOUT_SECONDS = 180;

/**
 * Opens a dedicated DB client for a plan generation stream.
 *
 * Callers MUST invoke the returned `cleanup()` exactly once (or wrap it in an
 * idempotent helper) when the stream ends so the dedicated RLS connection is
 * released promptly.
 */
export async function createStreamDbClient(authUserId: string): Promise<{
	dbClient: AttemptsDbClient;
	cleanup: () => Promise<void>;
}> {
	const normalizedAuthUserId = authUserId.trim();
	if (normalizedAuthUserId.length === 0) {
		throw new Error('createStreamDbClient requires a non-empty authUserId');
	}

	if (appEnv.isTest) {
		return {
			dbClient: getDb(),
			cleanup: async () => {},
		};
	}

	const { createAuthenticatedRlsClient } = await import('@/lib/db/rls');
	const { db, cleanup } = await createAuthenticatedRlsClient(
		normalizedAuthUserId,
		{
			idleTimeout: RLS_IDLE_TIMEOUT_SECONDS,
		},
	);

	return {
		dbClient: db,
		cleanup,
	};
}
