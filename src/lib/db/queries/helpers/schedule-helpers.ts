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
