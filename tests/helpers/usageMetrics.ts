import { InferModel, eq } from 'drizzle-orm';

import { usageMetrics } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

export type UsageMetricsRow = InferModel<typeof usageMetrics>;

export async function ensureUsageMetricsRow(
  userId: string,
  month: string
): Promise<UsageMetricsRow> {
  const [inserted] = await db
    .insert(usageMetrics)
    .values({ userId, month })
    .onConflictDoNothing()
    .returning();

  if (inserted) {
    return inserted;
  }

  const [existing] = await db
    .select()
    .from(usageMetrics)
    .where(eq(usageMetrics.userId, userId))
    .limit(1);

  if (!existing) {
    throw new Error(
      `Failed to ensure usage_metrics row for user ${userId} and month ${month}`
    );
  }

  return existing;
}
