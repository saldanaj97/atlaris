import type { DbClient, DbTransaction } from '@/lib/db/types';

import { modules } from '@supabase/schema';
import { and, eq, sql } from 'drizzle-orm';

/** Namespace `3`: plan lifecycle (claim, reservation, success persist, delete). */
export const PLAN_LIFECYCLE_LOCK_NAMESPACE = 3;
const PLAN_LIFECYCLE_LOCK_TIMEOUT_MS = 15_000;

export async function lockPlanLifecycle(
  tx: Pick<DbTransaction, 'execute'>,
  planId: string,
): Promise<void> {
  await tx.execute(
    sql`SELECT set_config('lock_timeout', ${`${PLAN_LIFECYCLE_LOCK_TIMEOUT_MS}ms`}, true)`,
  );
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${sql.raw(String(PLAN_LIFECYCLE_LOCK_NAMESPACE))}, hashtext(${planId}))`,
  );
}

export async function hasActiveChildModuleGeneration(
  dbOrTx: Pick<DbClient, 'select'>,
  planId: string,
): Promise<boolean> {
  const [row] = await dbOrTx
    .select({ id: modules.id })
    .from(modules)
    .where(
      and(
        eq(modules.planId, planId),
        eq(modules.lessonGenerationStatus, 'generating'),
      ),
    )
    .limit(1);

  return row != null;
}
