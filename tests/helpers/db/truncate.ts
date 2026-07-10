import {
  aiUsageEvents,
  clerkWebhookEvents,
  emailNotificationDeliveries,
  emailNotificationDeliveryRuns,
  generationAttempts,
  jobQueue,
  learningActivityEvents,
  learningPlans,
  modules,
  oauthStateTokens,
  planSchedules,
  resources,
  taskProgress,
  taskResources,
  tasks,
  usageMetrics,
  userEmailNotificationPreferences,
  userEmailNotificationSettings,
  userPreferences,
  users,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { type SQL, sql } from 'drizzle-orm';

function assertSafeToTruncate() {
  const url = process.env.POSTGRES_URL;
  if (!url) return;

  if (process.env.ALLOW_DB_TRUNCATE === 'true') return;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      'Refusing to truncate database: invalid POSTGRES_URL for safety. ' +
        'Set a valid test DB URL or ALLOW_DB_TRUNCATE=true.',
    );
  }

  const dbName = parsed.pathname.replace(/^\//, '');
  // Allow shapes:
  // - bare `test` / `tests` or any `*_test` / `*_tests` (legacy test DBs)
  // - `atlaris_test` plus the worker-isolated variants (`_w<digits>`, `_template`, `_base`).
  // Reject ambiguous middle-of-name matches like `myapp_test_archive` so this guard
  // does not silently accept production-adjacent databases.
  const looksLikeTestDb =
    /(^|_)(test|tests)$/.test(dbName) ||
    /^atlaris_test(_w\d+|_template|_base)?$/.test(dbName);

  if (!looksLikeTestDb) {
    throw new Error(
      `Refusing to truncate non-test database "${dbName}". ` +
        'Use a dedicated test DB (e.g., "postgres_test") or set ALLOW_DB_TRUNCATE=true.',
    );
  }
}

/**
 * Every table the truncate helper touches. Listing each FK-related table explicitly
 * (instead of relying on CASCADE) keeps the lock set deterministic so the single
 * TRUNCATE statement grabs every AccessExclusiveLock atomically. That closes the
 * deadlock window that individual per-table TRUNCATEs leave open when another
 * pooled service-role connection (e.g. a lingering one from a prior test file)
 * still holds locks on overlapping tables.
 *
 * Contributors: when you add tables or foreign keys, append imports and extend
 * `TRUNCATE_TABLES` in dependency-safe order. A stale list fails fast (FK errors)
 * or can re-open cross-connection deadlocks—do not rely on CASCADE here.
 */
const TRUNCATE_TABLES = [
  taskResources,
  learningActivityEvents,
  taskProgress,
  aiUsageEvents,
  generationAttempts,
  jobQueue,
  planSchedules,
  tasks,
  modules,
  resources,
  learningPlans,
  usageMetrics,
  userEmailNotificationPreferences,
  userEmailNotificationSettings,
  userPreferences,
  emailNotificationDeliveries,
  emailNotificationDeliveryRuns,
  clerkWebhookEvents,
  oauthStateTokens,
  users,
] as const;

const DEADLOCK_SQLSTATE = '40P01';
const LOCK_NOT_AVAILABLE_SQLSTATE = '55P03';
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 50;

/**
 * Truncate core tables between tests to guarantee isolation.
 *
 * Runs inside a transaction with a short `lock_timeout` so any lingering locks
 * from another pooled connection surface quickly as a retryable error rather than
 * a 90s test hang. A single multi-table TRUNCATE acquires every AccessExclusiveLock
 * atomically, eliminating the inter-statement deadlock window the previous
 * children-first loop left open.
 */
export async function truncateAll() {
  assertSafeToTruncate();

  const tableList = sql.join(
    TRUNCATE_TABLES.map((table) => sql`${table}`),
    sql.raw(', '),
  );

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await runTruncate(tableList);
      return;
    } catch (error) {
      if (attempt < MAX_RETRIES && isRetryableLockError(error)) {
        await wait(RETRY_BACKOFF_MS * attempt);
        continue;
      }
      throw error;
    }
  }
}

async function runTruncate(tableList: SQL): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await tx.execute(sql`TRUNCATE TABLE ${tableList} RESTART IDENTITY`);
  });
}

function isRetryableLockError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const code = (error as { code: unknown }).code;
  if (typeof code !== 'string' && typeof code !== 'number') {
    return false;
  }
  const codeStr = String(code);
  return (
    codeStr === DEADLOCK_SQLSTATE || codeStr === LOCK_NOT_AVAILABLE_SQLSTATE
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
