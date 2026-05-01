import { type SQLWrapper, sql } from 'drizzle-orm';

import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import { db as serviceDb } from '@/lib/db/service-role';

type RlsTransactionContext = {
  shouldNormalizeRlsContext: boolean;
  requestJwtClaims: string | null;
};

/**
 * Reads JWT claims from the session when using an RLS client (not service role),
 * so they can be re-applied inside a transaction.
 */
export async function prepareRlsTransactionContext(
  dbClient: AttemptsDbClient,
): Promise<RlsTransactionContext> {
  const shouldNormalizeRlsContext = dbClient !== serviceDb;
  let requestJwtClaims: string | null = null;

  if (shouldNormalizeRlsContext) {
    const claimsRows = await dbClient.execute<{ claims: string | null }>(
      sql`SELECT current_setting('request.jwt.claims', true) AS claims`,
    );
    const rawClaims = claimsRows[0]?.claims;
    if (typeof rawClaims === 'string' && rawClaims.length > 0) {
      requestJwtClaims = rawClaims;
    }
  }

  return { shouldNormalizeRlsContext, requestJwtClaims };
}

type TxExecute = {
  execute: (query: string | SQLWrapper) => PromiseLike<unknown>;
};

/**
 * Re-applies captured JWT claims inside a transaction (matches reserve/finalize behavior).
 */
export async function reapplyJwtClaimsInTransaction(
  tx: TxExecute,
  ctx: RlsTransactionContext,
): Promise<void> {
  if (ctx.shouldNormalizeRlsContext && ctx.requestJwtClaims !== null) {
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${ctx.requestJwtClaims}, true)`,
    );
  }
}
