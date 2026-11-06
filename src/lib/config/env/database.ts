import { getServerOptional, getServerRequired } from '@/lib/config/env/shared';

const getPrimaryDatabaseUrl = (): string => getServerRequired('POSTGRES_URL');

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
      getServerOptional('POSTGRES_URL_NON_POOLING') ?? getPrimaryDatabaseUrl()
    );
  },
  /**
   * Direct (non-pooled) URL for clients that hold session state. Unlike
   * `nonPoolingUrl` it never falls back to `POSTGRES_URL`, which is the pooled
   * URL on hosted deploys: `SET ROLE` and `request.jwt.claims` are session state
   * that a transaction-mode pooler drops between statements.
   */
  get directUrl(): string {
    const url = getServerOptional('POSTGRES_URL_NON_POOLING');
    if (!url) {
      throw new Error(
        'POSTGRES_URL_NON_POOLING must be set for RLS clients. Their SET ROLE and request.jwt.claims session state does not survive a pooled POSTGRES_URL.',
      );
    }
    return url;
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
