import { sql } from 'drizzle-orm';

import {
  aiUsageEvents,
  generationAttempts,
  googleCalendarSyncState,
  integrationTokens,
  jobQueue,
  learningPlans,
  modules,
  resources,
  stripeWebhookEvents,
  taskCalendarEvents,
  taskProgress,
  taskResources,
  tasks,
  usageMetrics,
  users,
} from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

function assertSafeToTruncate() {
  const url = process.env.DATABASE_URL;
  if (!url) return;

  if (process.env.ALLOW_DB_TRUNCATE === 'true') return;

  try {
    const parsed = new URL(url);
    const dbName = parsed.pathname.replace(/^\//, '');
    const looksLikeTestDb =
      /(^|_)(test|tests)$/.test(dbName) || /_test$/.test(dbName);

    if (!looksLikeTestDb) {
      throw new Error(
        `Refusing to truncate non-test database "${dbName}". ` +
          'Use a dedicated test DB (e.g., "postgres_test") or set ALLOW_DB_TRUNCATE=true.'
      );
    }
  } catch {
    throw new Error(
      'Refusing to truncate database: invalid DATABASE_URL for safety. ' +
        'Set a valid test DB URL or ALLOW_DB_TRUNCATE=true.'
    );
  }
}

/**
 * Truncate core tables between tests to guarantee isolation.
 * Tables are truncated in dependency order to avoid deadlocks.
 */
export async function truncateAll() {
  assertSafeToTruncate();

  // Truncate tables individually in dependency order (children before parents)
  // This avoids deadlocks that can occur when truncating multiple tables at once
  await db.execute(
    sql`TRUNCATE TABLE ${generationAttempts} RESTART IDENTITY CASCADE`
  );
  await db.execute(sql`TRUNCATE TABLE ${jobQueue} RESTART IDENTITY CASCADE`);
  await db.execute(
    sql`TRUNCATE TABLE ${taskResources} RESTART IDENTITY CASCADE`
  );
  await db.execute(
    sql`TRUNCATE TABLE ${taskProgress} RESTART IDENTITY CASCADE`
  );
  await db.execute(
    sql`TRUNCATE TABLE ${aiUsageEvents} RESTART IDENTITY CASCADE`
  );
  await db.execute(sql`TRUNCATE TABLE ${tasks} RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE ${modules} RESTART IDENTITY CASCADE`);
  await db.execute(
    sql`TRUNCATE TABLE ${learningPlans} RESTART IDENTITY CASCADE`
  );
  await db.execute(
    sql`TRUNCATE TABLE ${integrationTokens} RESTART IDENTITY CASCADE`
  );
  await db.execute(
    sql`TRUNCATE TABLE ${googleCalendarSyncState} RESTART IDENTITY CASCADE`
  );
  await db.execute(
    sql`TRUNCATE TABLE ${taskCalendarEvents} RESTART IDENTITY CASCADE`
  );
  await db.execute(
    sql`TRUNCATE TABLE ${stripeWebhookEvents} RESTART IDENTITY CASCADE`
  );
  await db.execute(
    sql`TRUNCATE TABLE ${usageMetrics} RESTART IDENTITY CASCADE`
  );
  await db.execute(sql`TRUNCATE TABLE ${users} RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE ${resources} RESTART IDENTITY CASCADE`);
}
