/**
 * PostgreSQL column names the `authenticated` role may UPDATE on `public.users`.
 *
 * Must stay aligned with `src/lib/db/migrations/0018_harden_users_update_columns.sql`.
 * Consumed by Testcontainers (`tests/setup/testcontainers.ts`) and
 * `tests/helpers/db/rls-bootstrap.ts` when mirroring production grants in ephemeral DBs.
 */
export const USERS_AUTHENTICATED_UPDATE_COLUMNS = [
	'name',
	'preferred_ai_model',
	'updated_at',
] as const;

/** Comma-separated identifiers for `GRANT UPDATE (...)` embedding. */
export const USERS_AUTHENTICATED_UPDATE_COLUMNS_SQL =
	USERS_AUTHENTICATED_UPDATE_COLUMNS.join(', ');
