import { sql } from 'drizzle-orm';

import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import { isServiceRoleDbClient } from '@/lib/db/service-role';

/**
 * Session snapshot for replaying `request.jwt.claims` on the connection Drizzle uses inside `transaction()`.
 * `requiresJwtClaimReplay` is false for service-role (`isServiceRoleDbClient(dbClient)`). Otherwise `prepareRlsTransactionContext`
 * runs `current_setting('request.jwt.claims', true)`; `requestJwtClaims` stays null when unset or empty so `reapplyJwtClaimsInTransaction` is a no-op.
 */
export type RlsTransactionContext = {
  requiresJwtClaimReplay: boolean;
  requestJwtClaims: string | null;
};

type RlsClaimsClient = Pick<AttemptsDbClient, 'execute'>;

/**
 * When caller uses request-scoped RLS client (not `serviceDb`), reads JWT claims from the session
 * so {@link reapplyJwtClaimsInTransaction} can restore them inside `transaction(...)`.
 * Service-role skips capture (RLS bypass); empty/null claims skip replay.
 */
export async function prepareRlsTransactionContext(
  dbClient: RlsClaimsClient,
): Promise<RlsTransactionContext> {
  const requiresJwtClaimReplay = !isServiceRoleDbClient(dbClient);
  let requestJwtClaims: string | null = null;

  if (requiresJwtClaimReplay) {
    const claimsRows = await dbClient.execute<{ claims: string | null }>(
      sql`SELECT current_setting('request.jwt.claims', true) AS claims`,
    );
    const rawClaims = claimsRows[0]?.claims;
    if (typeof rawClaims === 'string' && rawClaims.length > 0) {
      requestJwtClaims = rawClaims;
    }
  }

  return { requiresJwtClaimReplay, requestJwtClaims };
}

/**
 * Restores captured JWT claims on the transaction connection (`set_config(..., true)` = transaction-local).
 */
export async function reapplyJwtClaimsInTransaction(
  tx: RlsClaimsClient,
  ctx: RlsTransactionContext,
): Promise<void> {
  if (ctx.requiresJwtClaimReplay && ctx.requestJwtClaims !== null) {
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${ctx.requestJwtClaims}, true)`,
    );
  }
}
