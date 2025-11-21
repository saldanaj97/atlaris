import { db } from '@/lib/db/service-role';
import { usageMetrics } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * Ensure a usage metrics row exists for a user/month combination.
 * Respects the unique constraint on (userId, month).
 *
 * @param userId - The user ID
 * @param month - The month in YYYY-MM format
 * @returns The usage metrics row
 */
export async function ensureUsageMetricsRow(userId: string, month: string) {
  // Try to insert, but ignore if it already exists
  const [row] = await db
    .insert(usageMetrics)
    .values({ userId, month })
    .onConflictDoNothing()
    .returning();

  // If insert succeeded, return the new row
  if (row) return row;

  // Otherwise, fetch the existing row
  const [existing] = await db
    .select()
    .from(usageMetrics)
    .where(and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month)))
    .limit(1);

  if (!existing) {
    throw new Error(
      `Failed to ensure usage metrics row for user ${userId}, month ${month}`
    );
  }

  return existing;
}
