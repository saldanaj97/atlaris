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
  get nonPoolingUrl(): string {
    return (
      getServerOptional('POSTGRES_URL_NON_POOLING') ?? getPrimaryDatabaseUrl()
    );
  },
  get directUrl(): string {
    const url = getServerOptional('POSTGRES_URL_NON_POOLING');
    if (!url) {
      throw new Error(
        'POSTGRES_URL_NON_POOLING must be set for RLS clients. Their SET ROLE and request.jwt.claims session state does not survive a pooled POSTGRES_URL.',
      );
    }
    return url;
  },
  get anonymousRoleUrl(): string {
    return getRoleDatabaseUrl('DATABASE_URL_ANONYMOUS_ROLE');
  },
  get authenticatedRoleUrl(): string {
    return getRoleDatabaseUrl('DATABASE_URL_AUTHENTICATED_ROLE');
  },
};
