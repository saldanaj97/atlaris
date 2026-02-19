import type { PgErrorShape } from '@/lib/db/queries/types/schedule.types';
import { planSchedules } from '@/lib/db/schema';
import type { ScheduleCacheRow } from '@/lib/scheduling/types';
import { scheduleJsonSchema } from '@/lib/scheduling/types';

/**
 * Maps a raw `planSchedules` database row to a typed {@link ScheduleCacheRow}.
 *
 * Validates the `scheduleJson` field using runtime validation to ensure
 * external database data conforms to the expected structure.
 *
 * @throws {Error} If `scheduleJson` validation fails
 */
export function mapDbRowToScheduleCacheRow(
  dbRow: typeof planSchedules.$inferSelect
): ScheduleCacheRow {
  // Validate scheduleJson at the data boundary
  const validatedScheduleJson = scheduleJsonSchema.parse(dbRow.scheduleJson);

  return {
    ...dbRow,
    scheduleJson: validatedScheduleJson,
  };
}

/**
 * Detects whether a database write error is related to plan ownership or access constraints.
 *
 * Treats PostgreSQL error codes `42501` (insufficient_privilege) and `23503`
 * (foreign_key_violation) as ownership/authorization write failures. Also falls
 * back to message matching for row-level security and foreign key failures.
 *
 * @param error - Unknown thrown error value.
 * @returns `true` when the error matches known ownership/access write failures.
 */
export function isPlanOwnershipWriteError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const dbError = error as PgErrorShape;

  if (dbError.code === '42501' || dbError.code === '23503') {
    return true;
  }

  return (
    typeof dbError.message === 'string' &&
    (dbError.message.includes('row-level security') ||
      dbError.message.includes('foreign key constraint'))
  );
}
