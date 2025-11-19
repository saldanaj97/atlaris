import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/service-role';

/**
 * T001: Validates that the job_queue table exposes the expected columns and indexes
 * required by the background worker pipeline.
 */

describe('Job queue schema integrity', () => {
  it('includes required columns and indexes', async () => {
    const columnRows = (await db.execute(sql`
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'job_queue'
    `)) as Array<{ column_name: string }>;

    const columnNames = new Set(columnRows.map((row) => row.column_name));

    // Core columns (id/type/status/prioritisation/state tracking)
    for (const requiredColumn of [
      'id',
      'plan_id',
      'user_id',
      'job_type',
      'status',
      'priority',
      'attempts',
      'max_attempts',
      'payload',
      'result',
      'error',
      'scheduled_for',
      'started_at',
      'completed_at',
      'created_at',
      'updated_at',
    ]) {
      expect(columnNames.has(requiredColumn)).toBe(true);
    }

    const indexRows = (await db.execute(sql`
      select indexname
      from pg_indexes
      where schemaname = 'public' and tablename = 'job_queue'
    `)) as Array<{ indexname: string }>;

    const indexNames = new Set(indexRows.map((row) => row.indexname));

    for (const requiredIndex of [
      'idx_job_queue_status_scheduled_priority',
      'idx_job_queue_user_id',
      'idx_job_queue_plan_id',
      'idx_job_queue_created_at',
    ]) {
      expect(indexNames.has(requiredIndex)).toBe(true);
    }
  });
});
