import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';

/** Minimal callable surface the attempt helpers need from a DB client. */
const ATTEMPTS_DB_METHODS = [
	'select',
	'insert',
	'update',
	'delete',
	'transaction',
] as const;

/**
 * Narrow runtime shape check for AttemptsDbClient.
 * Confirms the required methods exist, but does not guarantee full Drizzle parity.
 */
export function isAttemptsDbClient(db: unknown): db is AttemptsDbClient {
	if (db == null || typeof db !== 'object') {
		return false;
	}
	const obj = db as Record<string, unknown>;
	return ATTEMPTS_DB_METHODS.every(
		(method) => typeof obj[method] === 'function',
	);
}
