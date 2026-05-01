import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

import { db as serviceDb, isServiceRoleDbClient } from '@/lib/db/service-role';
import {
  prepareRlsTransactionContext,
  reapplyJwtClaimsInTransaction,
} from '@/lib/db/queries/helpers/rls-jwt-claims';

describe('prepareRlsTransactionContext', () => {
  it('service-role client: no replay, no claims query', async () => {
    expect(isServiceRoleDbClient(serviceDb)).toBe(true);
    await expect(prepareRlsTransactionContext(serviceDb)).resolves.toEqual({
      requiresJwtClaimReplay: false,
      requestJwtClaims: null,
    });
  });

  it('non-service client: empty execute rows leave claims null', async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const ctx = await prepareRlsTransactionContext({ execute });
    expect(ctx.requiresJwtClaimReplay).toBe(true);
    expect(ctx.requestJwtClaims).toBeNull();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('non-service client: captures non-empty jwt claims string', async () => {
    const claims = '{"sub":"user-1"}';
    const execute = vi
      .fn()
      .mockResolvedValue([{ claims }] satisfies { claims: string }[]);
    const ctx = await prepareRlsTransactionContext({ execute });

    expect(ctx).toEqual({
      requiresJwtClaimReplay: true,
      requestJwtClaims: claims,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('non-service client: empty claims skips replay payload', async () => {
    const execute = vi.fn().mockResolvedValue([{ claims: '' }]);
    const ctx = await prepareRlsTransactionContext({ execute });

    expect(ctx.requiresJwtClaimReplay).toBe(true);
    expect(ctx.requestJwtClaims).toBeNull();
  });

  it('non-service client: null claims skips replay payload', async () => {
    const execute = vi.fn().mockResolvedValue([{ claims: null }]);
    const ctx = await prepareRlsTransactionContext({ execute });

    expect(ctx.requiresJwtClaimReplay).toBe(true);
    expect(ctx.requestJwtClaims).toBeNull();
  });

  it('non-service client: empty result set skips replay payload', async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const ctx = await prepareRlsTransactionContext({ execute });

    expect(ctx.requiresJwtClaimReplay).toBe(true);
    expect(ctx.requestJwtClaims).toBeNull();
  });
});

describe('reapplyJwtClaimsInTransaction', () => {
  it('service-role-shaped ctx skips execute', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    await reapplyJwtClaimsInTransaction(
      { execute },
      { requiresJwtClaimReplay: false, requestJwtClaims: '{"sub":"x"}' },
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('replay skipped when claims missing', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    await reapplyJwtClaimsInTransaction(
      { execute },
      { requiresJwtClaimReplay: true, requestJwtClaims: null },
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('replay uses transaction-local set_config (third arg true)', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const claims = '{"sub":"user-2"}';

    await reapplyJwtClaimsInTransaction(
      { execute },
      { requiresJwtClaimReplay: true, requestJwtClaims: claims },
    );

    expect(execute).toHaveBeenCalledTimes(1);
    const stmt = execute.mock.calls[0]?.[0];
    expect(stmt).toBeDefined();
    // Drizzle SQL object shape for sqlToQuery input varies by version; `never` keeps the test focused on rendered SQL.
    const { sql: renderedSql } = new PgDialect().sqlToQuery(stmt as never);
    expect(renderedSql).toContain('set_config');
    expect(renderedSql).toContain('true');
    expect(renderedSql).toContain('request.jwt.claims');
  });
});
