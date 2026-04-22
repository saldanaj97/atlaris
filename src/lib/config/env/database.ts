import { getServerOptional, getServerRequired } from '@/lib/config/env/shared';

const getPrimaryDatabaseUrl = (): string => getServerRequired('DATABASE_URL');

const getRoleDatabaseUrl = (key: string): string =>
	getServerOptional(key) ?? getPrimaryDatabaseUrl();

/**
 * Database connection URLs for the default app role plus specialized fallbacks
 * used by tests and RLS simulation helpers.
 */
export const databaseEnv = {
	get url(): string {
		return getPrimaryDatabaseUrl();
	},
	/** Prefer the non-pooling URL when available for migrations and direct clients. */
	get nonPoolingUrl(): string {
		return (
			getServerOptional('DATABASE_URL_NON_POOLING') ??
			getServerOptional('DATABASE_URL_UNPOOLED') ??
			getPrimaryDatabaseUrl()
		);
	},
	/** Anonymous-role fallback defaults to the primary database URL. */
	get anonymousRoleUrl(): string {
		return getRoleDatabaseUrl('DATABASE_URL_ANONYMOUS_ROLE');
	},
	/** Authenticated-role fallback defaults to the primary database URL. */
	get authenticatedRoleUrl(): string {
		return getRoleDatabaseUrl('DATABASE_URL_AUTHENTICATED_ROLE');
	},
};
